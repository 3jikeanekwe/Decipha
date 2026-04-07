// ============================================================
// js/cpg.js
// CPG (Custom Pixel Graphics) — your custom game language.
// This file handles reading and writing the CPG format.
// Every game object — avatar, power, world — is stored as CPG.
// ============================================================


// ─────────────────────────────────────────────
// writeCPGFile
//
// Takes a full avatar data object and serialises it into
// a CPG text file string you can save and reload later.
// Every block starts with BEGIN and ends with END.
// ─────────────────────────────────────────────
export function writeCPGFile(avatarData) {

  // We build the file as an array of lines then join them
  const lines = [];

  // ── META block ──────────────────────────────
  // Identity information about this CPG file
  lines.push(`BEGIN META ${avatarData.id}`);
  lines.push(`  version : 1.0`);                          // CPG spec version
  lines.push(`  type    : avatar`);                       // what kind of object this is
  lines.push(`  name    : ${avatarData.name}`);           // display name
  lines.push(`  created : ${new Date().toISOString()}`);  // timestamp
  lines.push(`END META`);
  lines.push(``);

  // ── MESH block ──────────────────────────────
  // All 3D geometry — vertices and triangles
  lines.push(`BEGIN MESH ${avatarData.id}`);
  lines.push(`  vertices  : ${avatarData.mesh.points.length}`);     // total point count
  lines.push(`  triangles : ${avatarData.mesh.triangles.length}`);  // total triangle count

  // Write one vertex line per point: V index  x:val  y:val  z:val  rgb(r,g,b)
  avatarData.mesh.points.forEach((p, i) => {
    lines.push(
      `  V ${String(i).padStart(6)}` +          // vertex index
      `  x:${p.x.toFixed(2).padStart(8)}` +     // X position
      `  y:${p.y.toFixed(2).padStart(8)}` +     // Y position
      `  z:${p.z.toFixed(2).padStart(8)}` +     // Z depth
      `  rgb(${p.r},${p.g},${p.b})`             // colour
    );
  });

  // Write one triangle line per face: T  a:i  b:i  c:i
  avatarData.mesh.triangles.forEach(t => {
    lines.push(
      `  T` +
      `  a:${String(t.a).padStart(6)}` +  // first vertex index
      `  b:${String(t.b).padStart(6)}` +  // second vertex index
      `  c:${String(t.c).padStart(6)}`    // third vertex index
    );
  });
  lines.push(`END MESH`);
  lines.push(``);

  // ── SKIN block ──────────────────────────────
  // Colour and material properties
  lines.push(`BEGIN SKIN ${avatarData.id}`);
  lines.push(`  baseColour  : rgb(${avatarData.skin.base.r},${avatarData.skin.base.g},${avatarData.skin.base.b})`);
  lines.push(`  roughness   : ${avatarData.skin.roughness}`);   // 0=mirror 1=matte
  lines.push(`  metalness   : ${avatarData.skin.metalness}`);   // 0=plastic 1=metal
  lines.push(`  emissive    : rgb(0,0,0)`);                     // glow colour (black = no glow)
  lines.push(`  colourMode  : ${avatarData.skin.colourMode}`);  // texture / flat / depth
  lines.push(`END SKIN`);
  lines.push(``);

  // ── SKELETON block ──────────────────────────
  // Bones that drive animation
  lines.push(`BEGIN SKELETON ${avatarData.id}`);
  for (const bone of avatarData.skeleton) {                         // loop every bone
    lines.push(
      `  BONE ${bone.name.padEnd(12)}` +                            // bone name
      `  parent:${(bone.parent || 'none').padEnd(12)}` +            // parent bone name
      `  pos:(${bone.position.x.toFixed(1)},` +
      `${bone.position.y.toFixed(1)},` +
      `${bone.position.z.toFixed(1)})`                              // rest position
    );
  }
  lines.push(`END SKELETON`);
  lines.push(``);

  // ── PHYSICS block ────────────────────────────
  // How this character interacts with the world
  lines.push(`BEGIN PHYSICS ${avatarData.id}`);
  lines.push(`  mass        : ${avatarData.physics.mass}`);         // kg — affects knockback
  lines.push(`  gravity     : ${avatarData.physics.gravity}`);      // how fast they fall
  lines.push(`  friction    : ${avatarData.physics.friction}`);     // ground friction
  lines.push(`  bounciness  : ${avatarData.physics.bounciness}`);   // how much they bounce
  lines.push(`  drag        : ${avatarData.physics.drag}`);         // air resistance
  lines.push(`  canFly      : ${avatarData.physics.canFly}`);       // ignores gravity?
  lines.push(`  canSwim     : ${avatarData.physics.canSwim}`);      // moves in water?
  lines.push(`END PHYSICS`);
  lines.push(``);

  // ── HITBOX block ─────────────────────────────
  // Collision shape used for hit detection
  lines.push(`BEGIN HITBOX ${avatarData.id}`);
  lines.push(`  type    : ${avatarData.hitbox.type}`);              // capsule / box / sphere
  lines.push(`  radius  : ${avatarData.hitbox.radius}`);           // half-width
  lines.push(`  height  : ${avatarData.hitbox.height}`);           // full height
  lines.push(`  offsetY : ${avatarData.hitbox.offsetY}`);          // lift above ground
  lines.push(`END HITBOX`);
  lines.push(``);

  // ── STATS block ──────────────────────────────
  // All numerical game stats
  lines.push(`BEGIN STATS ${avatarData.id}`);
  for (const [key, value] of Object.entries(avatarData.stats)) {   // loop every stat
    lines.push(`  ${key.padEnd(14)} : ${value}`);
  }
  lines.push(`END STATS`);
  lines.push(``);

  // ── POWER blocks (one per power) ─────────────
  for (const power of avatarData.powers) {                          // loop every assigned power
    lines.push(`BEGIN POWER ${power.id}`);
    for (const [key, value] of Object.entries(power)) {            // loop every property
      if (key !== 'id') lines.push(`  ${key.padEnd(16)} : ${value}`);
    }
    lines.push(`END POWER`);
    lines.push(``);
  }

  // ── LOGIC block ──────────────────────────────
  // Behaviour rules — IF/WHEN conditions
  lines.push(`BEGIN LOGIC ${avatarData.id}`);
  lines.push(`  WHEN health < 30          : TRIGGER lowHealthWarning`);   // warn at low HP
  lines.push(`  WHEN energy < 10          : PREVENT usePower`);           // no energy no powers
  lines.push(`  WHEN isGrounded = false   : ALLOW doubleJump IF jumps < 2`); // air jump rule
  lines.push(`  ON COLLISION ground       : SET isGrounded = true`);      // landing detection
  lines.push(`  ON COLLISION wall         : STOP horizontalVelocity`);    // wall stop
  lines.push(`END LOGIC`);
  lines.push(``);

  // Join every line with a newline and return the full file string
  return lines.join('\n');
}


// ─────────────────────────────────────────────
// parseCPGFile
//
// Reads a CPG text string and reconstructs the avatar
// data object from it. The reverse of writeCPGFile.
// ─────────────────────────────────────────────
export function parseCPGFile(cpgText) {

  // Split the text into individual lines for processing
  const lines = cpgText.split('\n');

  // This will hold the reconstructed data
  const result = {
    id:        '',       // avatar identifier
    name:      '',       // display name
    mesh:      { points: [], triangles: [] },  // 3D geometry
    skin:      {},       // material settings
    skeleton:  [],       // bone array
    physics:   {},       // physics settings
    hitbox:    {},       // collision shape
    stats:     {},       // game stats
    powers:    [],       // assigned powers
  };

  let currentBlock = null;  // which block we're currently reading
  let currentPower = null;  // power object being built (if in a POWER block)

  for (const rawLine of lines) {

    const line = rawLine.trim();  // remove leading/trailing whitespace

    if (line === '' || line.startsWith('//')) continue;  // skip blank lines and comments

    // ── Detect block start ──
    if (line.startsWith('BEGIN ')) {
      const parts = line.split(' ');   // ['BEGIN', 'META', 'avatar_id']
      currentBlock = parts[1];         // e.g. 'META', 'MESH', 'POWER'
      if (currentBlock === 'POWER') {
        currentPower = { id: parts[2] };  // start a new power object
      }
      continue;  // move to next line
    }

    // ── Detect block end ──
    if (line.startsWith('END ')) {
      if (currentBlock === 'POWER' && currentPower) {
        result.powers.push(currentPower);  // save completed power
        currentPower = null;               // reset power builder
      }
      currentBlock = null;  // no longer inside any block
      continue;
    }

    // ── Parse content based on current block ──

    if (currentBlock === 'META') {
      // Parse "key : value" lines
      const [key, ...valParts] = line.split(':');
      const val = valParts.join(':').trim();  // rejoin in case value had colons
      if (key.trim() === 'name') result.name = val;
    }

    if (currentBlock === 'MESH') {
      if (line.startsWith('V ')) {
        // Parse vertex line: V index  x:val  y:val  z:val  rgb(r,g,b)
        const xMatch   = line.match(/x:([-\d.]+)/);   // extract x value
        const yMatch   = line.match(/y:([-\d.]+)/);   // extract y value
        const zMatch   = line.match(/z:([-\d.]+)/);   // extract z value
        const rgbMatch = line.match(/rgb\((\d+),(\d+),(\d+)\)/);  // extract rgb
        if (xMatch && yMatch && zMatch && rgbMatch) {
          result.mesh.points.push({
            x: parseFloat(xMatch[1]),   // convert string to number
            y: parseFloat(yMatch[1]),
            z: parseFloat(zMatch[1]),
            r: parseInt(rgbMatch[1]),   // colour channels
            g: parseInt(rgbMatch[2]),
            b: parseInt(rgbMatch[3]),
          });
        }
      } else if (line.startsWith('T ')) {
        // Parse triangle line: T  a:i  b:i  c:i
        const aMatch = line.match(/a:(\d+)/);  // vertex A index
        const bMatch = line.match(/b:(\d+)/);  // vertex B index
        const cMatch = line.match(/c:(\d+)/);  // vertex C index
        if (aMatch && bMatch && cMatch) {
          result.mesh.triangles.push({
            a: parseInt(aMatch[1]),
            b: parseInt(bMatch[1]),
            c: parseInt(cMatch[1]),
          });
        }
      }
    }

    if (currentBlock === 'SKIN') {
      // Parse "key : value" pairs into the skin object
      const [k, ...vParts] = line.split(':');
      const key = k.trim();
      const val = vParts.join(':').trim();
      if (key === 'roughness')  result.skin.roughness  = parseFloat(val);
      if (key === 'metalness')  result.skin.metalness  = parseFloat(val);
      if (key === 'colourMode') result.skin.colourMode = val;
      if (key === 'baseColour') {
        const m = val.match(/rgb\((\d+),(\d+),(\d+)\)/);
        if (m) result.skin.base = { r: +m[1], g: +m[2], b: +m[3] };
      }
    }

    if (currentBlock === 'SKELETON') {
      if (line.startsWith('BONE ')) {
        // Parse bone line: BONE name  parent:name  pos:(x,y,z)
        const nameMatch   = line.match(/BONE\s+(\S+)/);
        const parentMatch = line.match(/parent:(\S+)/);
        const posMatch    = line.match(/pos:\(([-\d.]+),([-\d.]+),([-\d.]+)\)/);
        if (nameMatch && posMatch) {
          result.skeleton.push({
            name:     nameMatch[1],
            parent:   parentMatch ? (parentMatch[1] === 'none' ? null : parentMatch[1]) : null,
            position: { x: +posMatch[1], y: +posMatch[2], z: +posMatch[3] },
          });
        }
      }
    }

    if (currentBlock === 'PHYSICS') {
      // Parse physics key:value lines
      const [k, v] = line.split(':');
      const key = k.trim(), val = v ? v.trim() : '';
      if (key === 'mass')       result.physics.mass       = parseFloat(val);
      if (key === 'gravity')    result.physics.gravity    = parseFloat(val);
      if (key === 'friction')   result.physics.friction   = parseFloat(val);
      if (key === 'bounciness') result.physics.bounciness = parseFloat(val);
      if (key === 'drag')       result.physics.drag       = parseFloat(val);
      if (key === 'canFly')     result.physics.canFly     = val === 'true';
      if (key === 'canSwim')    result.physics.canSwim    = val === 'true';
    }

    if (currentBlock === 'HITBOX') {
      const [k, v] = line.split(':');
      const key = k.trim(), val = v ? v.trim() : '';
      if (key === 'type')    result.hitbox.type    = val;
      if (key === 'radius')  result.hitbox.radius  = parseFloat(val);
      if (key === 'height')  result.hitbox.height  = parseFloat(val);
      if (key === 'offsetY') result.hitbox.offsetY = parseFloat(val);
    }

    if (currentBlock === 'STATS') {
      // Parse every stat as a key:value pair
      const [k, v] = line.split(':');
      if (k && v) result.stats[k.trim()] = parseFloat(v.trim());
    }

    if (currentBlock === 'POWER' && currentPower) {
      // Parse power properties into the current power object
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim();
        // Try to parse as number, else keep as string
        currentPower[key] = isNaN(val) ? val : parseFloat(val);
      }
    }
  }

  return result;  // return the fully reconstructed avatar data
}
