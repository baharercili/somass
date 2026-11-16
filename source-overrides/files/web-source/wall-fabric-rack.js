/* Wall-mounted fabric samples on the user's folded burgundy board and oak pegs. */
(function (g) {
  'use strict';
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const xml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const fallbackColors = ['#8b936e', '#c58462', '#ded6c0', '#5c6554'];

  function dimensions(o) {
    const width = Math.max(10, number(o.w, 160));
    const depth = Math.max(2, number(o.h, 16));
    const top = Math.max(20, number(o.heightCm, 180));
    const boardHeight = clamp(number(o.rackBoardHeightCm, 32), 8, top - 6);
    const count = clamp(Math.round(number(o.sampleCount, 8)), 2, 24);
    const pitch = width / count;
    const pegY = top - boardHeight / 2;
    const length = clamp(number(o.rackFabricLengthCm, 100), 5, pegY - 3);
    const radius = Math.min(pitch * .29, boardHeight * .19);
    const capThickness = depth * .12;
    const capFront = depth * .45;
    const capBack = capFront - capThickness;
    return {
      width, depth, top, boardHeight, count, pitch, pegY, length, radius,
      capThickness, capFront, capBack,
      back: -depth / 2,
      boardFront: -depth * .34,
      boardCrest: -depth * .245,
      clothZ: depth * .26,
      foldAmplitude: Math.min(.55, depth * .025),
      side: o.wallAnchor?.side === -1 ? -1 : 1
    };
  }

  function palette(o) {
    const list = g.SOMASS_SHOWROOM?.palettes;
    return (list?.find(p => p.key === o.palette)?.colors || fallbackColors).slice();
  }

  function grainTexture(T) {
    const width = 128, height = 256, data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const wander = Math.sin(y * .026) * 2.7 + Math.sin(y * .009) * 2;
      const fine = Math.sin((x + wander) * .85) * 4;
      const broad = Math.sin((x + wander * .5) * .14) * 8;
      const pores = Math.sin(x * 2.13 + y * .035) * 1.7;
      const v = clamp(236 + fine + broad + pores, 213, 254), at = (y * width + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = v; data[at + 3] = 255;
    }
    const texture = new T.DataTexture(data, width, height, T.RGBAFormat);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function weaveTexture(T) {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const warp = x % 4 < 2 ? 4 : -4, weft = y % 4 < 2 ? 3 : -3;
      const yarn = Math.sin(x * .43 + y * .17) * 1.6;
      const v = clamp(244 + warp + weft + yarn, 230, 255), at = (y * size + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = v; data[at + 3] = 255;
    }
    const texture = new T.DataTexture(data, size, size, T.RGBAFormat);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  function build(T, o, plan) {
    const d = dimensions(o), root = new T.Group();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.position.set(number(o.x, 0), 0, number(o.y, 0));
    root.rotation.y = -number(o.rotation, 0) * Math.PI / 180;
    root.scale.set(d.side, 1, d.side);
    const material = (color, extra = {}) => {
      const m = new T.MeshStandardMaterial({ color, roughness: .86, metalness: 0, ...extra });
      materials.add(m); return m;
    };
    const add = (geometry, mat, part, x = 0, y = 0, z = 0) => {
      geometries.add(geometry);
      const mesh = new T.Mesh(geometry, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { partitionObjectId: o.id, decorElement: true, rackPart: part };
      root.add(mesh); return mesh;
    };
    const oak = grainTexture(T), weave = weaveTexture(T);
    textures.add(oak); textures.add(weave);
    const board = material(o.color || '#754a48');
    const timber = material(o.rackPegColor || '#bd996e', { map: oak, roughness: .72 });
    const fabricMaterials = palette(o).map(color => material(color, {
      map: weave, bumpMap: weave, bumpScale: .045, side: T.DoubleSide, roughness: .98
    }));

    // A real folded section gives the backing its stepped silhouette and shaded folds.
    const front = [];
    for (let i = 0; i < d.count; i++) {
      const a = -d.width / 2 + d.pitch * i;
      front.push([a, d.boardFront], [a + d.pitch * .12, d.boardCrest],
        [a + d.pitch * .26, d.boardCrest], [a + d.pitch * .31, d.boardFront],
        [a + d.pitch, d.boardFront]);
    }
    const section = new T.Shape();
    section.moveTo(-d.width / 2, d.back);
    section.lineTo(d.width / 2, d.back);
    for (let i = front.length - 1; i >= 0; i--) section.lineTo(front[i][0], front[i][1]);
    section.closePath();
    const backing = new T.ExtrudeGeometry(section, { depth: d.boardHeight, bevelEnabled: false, steps: 1 });
    backing.rotateX(Math.PI / 2);
    add(backing, board, 'board', 0, d.top, 0);

    // The turned disc profile has a small bevel. The planar UVs preserve visible oak grain.
    const r = d.radius, half = d.capThickness / 2, bevel = Math.min(.26, r * .08, half * .42);
    const cap = new T.LatheGeometry([
      new T.Vector2(0, -half), new T.Vector2(r - bevel, -half),
      new T.Vector2(r, -half + bevel), new T.Vector2(r, half - bevel),
      new T.Vector2(r - bevel, half), new T.Vector2(0, half)
    ], 40);
    cap.rotateX(Math.PI / 2);
    const positions = cap.getAttribute('position'), normals = cap.getAttribute('normal'), uv = cap.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) if (Math.abs(normals.getZ(i)) > .4)
      uv.setXY(i, positions.getX(i) / (2 * r) + .5, positions.getY(i) / (2 * r) + .5);
    const stemStart = d.boardFront - .08, stemEnd = d.capBack + .04;
    const stem = new T.CylinderGeometry(r * .39, r * .39, stemEnd - stemStart, 24);
    stem.rotateX(Math.PI / 2);

    for (let i = 0; i < d.count; i++) {
      const cx = -d.width / 2 + d.pitch * (i + .5), mat = fabricMaterials[i % fabricMaterials.length];
      add(stem, timber, 'peg', cx, d.pegY, (stemStart + stemEnd) / 2);
      add(cap, timber, 'peg', cx, d.pegY, (d.capBack + d.capFront) / 2);

      // The support loop passes behind the oak face; its crown remains visible above it.
      const loopPositions = [], loopUV = [], loopIndex = [];
      const loopRadius = r + Math.min(.85, d.pitch * .04), ribbon = Math.min(1.25, d.pitch * .055), loopSegments = 24;
      for (let j = 0; j <= loopSegments; j++) {
        const a = Math.PI * j / loopSegments;
        for (const edge of [-1, 1]) {
          const rr = loopRadius + edge * ribbon / 2;
          loopPositions.push(cx + Math.cos(a) * rr, d.pegY + Math.sin(a) * rr, d.clothZ + .03 * Math.sin(a));
          loopUV.push(j / loopSegments, (edge + 1) / 2);
        }
        if (j < loopSegments) { const at = j * 2; loopIndex.push(at, at + 2, at + 1, at + 2, at + 3, at + 1); }
      }
      const loop = new T.BufferGeometry();
      loop.setAttribute('position', new T.Float32BufferAttribute(loopPositions, 3));
      loop.setAttribute('uv', new T.Float32BufferAttribute(loopUV, 2));
      loop.setIndex(loopIndex); loop.computeVertexNormals();
      add(loop, mat, 'loop');

      // Tension at the peg narrows the shoulder, then relaxes into small vertical folds.
      const columns = 24, rows = 20, fabricPositions = [], fabricUV = [], indices = [], hem = [];
      const swatchWidth = d.pitch * .78, drop = d.length * (i === d.count - 1 ? 1 : .93 + (i % 3) * .035);
      for (let j = 0; j <= rows; j++) {
        const v = j / rows, relax = .8 + .2 * (1 - (1 - v) ** 4);
        for (let n = 0; n <= columns; n++) {
          const u = n / columns, shoulder = d.pegY - 3 + 4 * Math.abs(2 * u - 1);
          const bottom = d.pegY - drop + .5 + .35 * Math.cos(u * Math.PI * 4 + i * .7);
          const x = cx + (u - .5) * swatchWidth * relax;
          const y = shoulder * (1 - v) + bottom * v;
          const fold = Math.sin(u * Math.PI * 6 + i * .2) * d.foldAmplitude * (.55 + v * .45);
          const z = d.clothZ + fold + Math.sin(v * Math.PI) * d.foldAmplitude * .2;
          fabricPositions.push(x, y, z);
          fabricUV.push(u * swatchWidth / 18, (1 - v) * drop / 32);
          if (j === rows) hem.push(new T.Vector3(x, y, z));
          if (j < rows && n < columns) {
            const at = j * (columns + 1) + n, below = at + columns + 1;
            indices.push(at, below, at + 1, below, below + 1, at + 1);
          }
        }
      }
      const fabric = new T.BufferGeometry();
      fabric.setAttribute('position', new T.Float32BufferAttribute(fabricPositions, 3));
      fabric.setAttribute('uv', new T.Float32BufferAttribute(fabricUV, 2));
      fabric.setIndex(indices); fabric.computeVertexNormals();
      add(fabric, mat, 'fabric');
      add(new T.TubeGeometry(new T.CatmullRomCurve3(hem), 24, Math.min(.12, d.pitch * .007), 5, false), mat, 'fabric');
    }
    let disposed = false;
    root.userData = {
      partitionObjectId: o.id, decorElement: true, modelKind: 'wall-fabric-rack',
      disposeDecor() {
        if (disposed) return; disposed = true;
        geometries.forEach(value => value.dispose());
        materials.forEach(value => value.dispose());
        textures.forEach(value => value.dispose());
      }
    };
    return root;
  }

  function svg(o, k = 1, printing = false, active = false) {
    const d = dimensions(o), colors = palette(o), board = xml(o.color || '#754a48'), peg = xml(o.rackPegColor || '#bd996e');
    let body = `<rect x="${-d.width / 2}" y="${d.back}" width="${d.width}" height="${d.boardCrest - d.back}" fill="${board}" stroke="#633d3a" stroke-width="${Math.min(k, .7)}"/>`;
    for (let i = 0; i < d.count; i++) {
      const x = -d.width / 2 + d.pitch * (i + .5), sw = d.pitch * .78;
      body += `<rect x="${x - sw / 2}" y="${d.clothZ - d.foldAmplitude}" width="${sw}" height="${2 * d.foldAmplitude}" fill="${xml(colors[i % colors.length])}" stroke="#6c685d" stroke-width="${Math.min(k, .35)}"/>`;
      body += `<rect x="${x - d.radius * .39}" y="${d.boardFront}" width="${d.radius * .78}" height="${d.capBack - d.boardFront}" fill="${peg}"/>`;
      body += `<rect x="${x - d.radius}" y="${d.capBack}" width="${2 * d.radius}" height="${d.capThickness}" rx="${Math.min(.5, d.capThickness / 3)}" fill="${peg}" stroke="#91714d" stroke-width="${Math.min(k, .5)}"/>`;
    }
    const name = xml(o.label || 'Duvar tipi kumaş numune askısı');
    return `<g data-id="${xml(o.id)}" class="decor-plan-object" transform="translate(${number(o.x, 0)} ${number(o.y, 0)}) rotate(${number(o.rotation, 0)})"><title>${name} · ${d.count} kumaş</title><g transform="scale(${d.side} ${d.side})">${body}</g><rect x="${-d.width / 2}" y="${-d.depth / 2}" width="${d.width}" height="${d.depth}" fill="transparent" stroke="${active ? '#b18a4b' : 'transparent'}" stroke-width="${active ? 1.5 * k : 0}" pointer-events="all"/>${active ? `<text x="0" y="${-d.depth / 2 - 9 * k}" text-anchor="middle" font-size="${10 * k}" fill="#665846" paint-order="stroke" stroke="${printing ? '#fff' : '#fffdf5'}" stroke-width="${3 * k}">${name}</text>` : ''}</g>`;
  }

  const api = { build, svg, dimensions };
  g.SOMASS_WALL_FABRIC_RACK = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
