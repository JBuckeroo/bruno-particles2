import * as THREE from 'https://unpkg.com/three@0.152.2/build/three.module.js';

const urlParams = new URLSearchParams(window.location.search);
const imageUrl = urlParams.get('image') || 'https://framerusercontent.com/images/vDeYQYFNhl2HPKJjZWj2WViUcw.jpg?width=320&height=180';

let scene, camera, renderer, particles, touchCanvas, touchCtx;

init();
animate();

function init() {
  const container = document.getElementById('container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.z = 300;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const loader = new THREE.TextureLoader();
  loader.load(imageUrl, (texture) => {
    const img = texture.image;
    const w = img.width;
    const h = img.height;

    // Create touch canvas
    touchCanvas = document.createElement('canvas');
    touchCanvas.width = w;
    touchCanvas.height = h;
    touchCtx = touchCanvas.getContext('2d');
    touchCtx.fillStyle = 'black';
    touchCtx.fillRect(0, 0, w, h);

    // Get pixel data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;

    const threshold = 34;
    const positions = [];
    const angles = [];
    const indices = [];

    for (let i = 0; i < w * h; i++) {
      if (data[i * 4] <= threshold) continue;
      positions.push(i % w, Math.floor(i / w), 0);
      angles.push(Math.random() * Math.PI);
      indices.push(i);
    }

    const geometry = new THREE.InstancedBufferGeometry();
    const basePositions = new Float32Array([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0]);
    const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const index = new Uint16Array([0, 2, 1, 2, 3, 1]);

    geometry.setAttribute('position', new THREE.BufferAttribute(basePositions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));

    geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('angle', new THREE.InstancedBufferAttribute(new Float32Array(angles), 1));
    geometry.setAttribute('pindex', new THREE.InstancedBufferAttribute(new Uint16Array(indices), 1));

    const vertexShader = `
      precision highp float;
      attribute vec3 position;
      attribute vec2 uv;
      attribute float pindex;
      attribute vec3 offset;
      attribute float angle;
      uniform mat4 projectionMatrix;
      uniform mat4 modelViewMatrix;
      uniform float uTime;
      uniform float uRandom;
      uniform float uDepth;
      uniform float uSize;
      uniform vec2 uTextureSize;
      uniform sampler2D uTexture;
      uniform sampler2D uTouch;
      varying vec2 vUv;
      varying float vGrey;
      float random(float n) { return fract(sin(n) * 43758.5453123); }
      float snoise_1_2(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vUv = uv;
        vec2 puv = offset.xy / uTextureSize;
        vec4 texColor = texture2D(uTexture, puv);
        float grey = texColor.r * 0.21 + texColor.g * 0.71 + texColor.b * 0.07;
        vGrey = grey;
        vec3 displaced = offset;
        displaced.xy += vec2(random(pindex) - 0.5, random(offset.x + pindex) - 0.5) * uRandom;
        float rndz = (random(pindex) + snoise_1_2(vec2(pindex * 0.1, uTime * 0.1)));
        displaced.z += rndz * (random(pindex) * 2.0 * uDepth);
        float t = texture2D(uTouch, puv).r;
        displaced.z += t * 20.0 * rndz;
        displaced.x += cos(angle) * t * 20.0 * rndz;
        displaced.y += sin(angle) * t * 20.0 * rndz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        float psize = (snoise_1_2(vec2(uTime, pindex) * 0.5) + 2.0) * max(grey, 0.2) * uSize;
        gl_PointSize = psize;
      }
    `;

    const fragmentShader = `
      precision highp float;
      varying vec2 vUv;
      varying float vGrey;
      void main() {
        float dist = 0.5 - distance(vUv, vec2(0.5));
        float alpha = smoothstep(0.0, 0.3, dist);
        gl_FragColor = vec4(vGrey, vGrey, vGrey, alpha);
      }
    `;

    const material = new THREE.RawShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRandom: { value: 1.0 },
        uDepth: { value: 2.0 },
        uSize: { value: 1.5 },
        uTextureSize: { value: new THREE.Vector2(w, h) },
        uTexture: { value: texture },
        uTouch: { value: new THREE.CanvasTexture(touchCanvas) },
        projectionMatrix: { value: new THREE.Matrix4() },
        modelViewMatrix: { value: new THREE.Matrix4() },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
    });

    particles = new THREE.Mesh(geometry, material);
    particles.position.set(-w / 2, -h / 2, 0);
    scene.add(particles);

    particles.onBeforeRender = function () {
      this.material.uniforms.projectionMatrix.value.copy(camera.projectionMatrix);
      this.material.uniforms.modelViewMatrix.value.copy(camera.matrixWorldInverse);
    };

    // Mouse interaction
    const mouse = { x: 0, y: 0, active: false };
    renderer.domElement.addEventListener('mousemove', (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mouse.active = true;
    });

    let time = 0;
    const animateLoop = () => {
      time += 0.016;
      if (touchCtx && mouse.active) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersect = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersect);
        const uvX = (intersect.x + w / 2) / w;
        const uvY = 1 - (intersect.y + h / 2) / h;
        if (uvX >= 0 && uvX <= 1 && uvY >= 0 && uvY <= 1) {
          const x = uvX * w;
          const y = uvY * h;
          const g = touchCtx.createRadialGradient(x, y, 0, x, y, 20);
          g.addColorStop(0, 'white');
          g.addColorStop(1, 'transparent');
          touchCtx.fillStyle = g;
          touchCtx.beginPath();
          touchCtx.arc(x, y, 20, 0, Math.PI * 2);
          touchCtx.fill();
        }
        mouse.active = false;
        material.uniforms.uTouch.value.needsUpdate = true;
      }
      material.uniforms.uTime.value = time;
      renderer.render(scene, camera);
      requestAnimationFrame(animateLoop);
    };
    animateLoop();
  });

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
}

function animate() {
  requestAnimationFrame(animate);
}
