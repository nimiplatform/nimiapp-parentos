import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

type NimiLoginBackgroundProfile = 'desktop' | 'web';
type ParticleBackgroundEnvironment = {
  document: Pick<Document, 'createElement'>;
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    connection?: {
      saveData?: boolean;
    };
  };
};

const BASE_PARTICLE_CONFIG = {
  particleCount: 500,
  connectDistance: 110,
  baseSpeed: 0.5,
  noiseScale: 0.003,
  timeScale: 0.2,
  mouseRepelRadius: 180,
  mouseRepelForce: 1.5,
  cohesionForce: 0.08,
  separationForce: 2.5,
  separationDistance: 30,
  centerAttractForce: 0.45,
  centerStopRadius: 60,
  centerVortexForce: 1.2,
  hoverNoiseScale: 0.006,
} as const;

const lowCapabilityThresholds = {
  hardwareConcurrency: 2,
  deviceMemory: 2,
} as const;

function resolveParticleConfig(profile: NimiLoginBackgroundProfile) {
  if (profile === 'web') {
    return {
      ...BASE_PARTICLE_CONFIG,
      particleCount: 1000,
      connectDistance: 118,
      baseSpeed: 0.62,
      mouseRepelRadius: 190,
    };
  }
  return { ...BASE_PARTICLE_CONFIG };
}

function readResolvedColorToken(element: HTMLElement, tokenName: string): string | null {
  const value = window.getComputedStyle(element).getPropertyValue(tokenName).trim();
  if (!value || value === 'initial') {
    return null;
  }
  return value;
}

export function shouldEnableNimiLoginBackground(env: ParticleBackgroundEnvironment): boolean {
  if (env.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }

  const navigatorInfo = env.navigator;
  if (navigatorInfo?.connection?.saveData) {
    return false;
  }
  if (
    typeof navigatorInfo?.hardwareConcurrency === 'number'
    && navigatorInfo.hardwareConcurrency <= lowCapabilityThresholds.hardwareConcurrency
  ) {
    return false;
  }
  if (
    typeof navigatorInfo?.deviceMemory === 'number'
    && navigatorInfo.deviceMemory <= lowCapabilityThresholds.deviceMemory
  ) {
    return false;
  }

  const canvas = env.document.createElement('canvas') as HTMLCanvasElement;
  return Boolean(
    canvas.getContext('webgl2')
      ?? canvas.getContext('webgl')
      ?? canvas.getContext('experimental-webgl' as 'webgl'),
  );
}

export function NimiLoginBackground({
  isLogoHovered = false,
  profile = 'desktop',
}: {
  isLogoHovered?: boolean;
  profile?: NimiLoginBackgroundProfile;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isHoveredRef = useRef(isLogoHovered);

  useEffect(() => {
    isHoveredRef.current = isLogoHovered;
  }, [isLogoHovered]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!shouldEnableNimiLoginBackground({
      document: window.document,
      matchMedia: window.matchMedia?.bind(window),
      navigator: window.navigator,
    })) {
      return;
    }

    const container = containerRef.current;
    let width = container.clientWidth;
    let height = container.clientHeight;
    const particleColor = readResolvedColorToken(container, '--nimi-status-info');
    const lineColor = readResolvedColorToken(container, '--nimi-text-inverse');
    if (!particleColor || !lineColor) {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 1, 1000);
    camera.position.z = 500;

    const renderer = (() => {
      try {
        return new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        });
      } catch {
        return null;
      }
    })();
    if (!renderer) {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const tuning = resolveParticleConfig(profile);
    const config = {
      ...tuning,
      particleColor: new THREE.Color(particleColor),
      lineColor: new THREE.Color(lineColor),
    };

    const noise3D = createNoise3D();
    const connectDistanceSq = config.connectDistance * config.connectDistance;
    const neighborOffsets = [
      [0, 0],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const;
    const spatialBuckets = new Map<number, number[]>();
    const cellCoords = new Int32Array(config.particleCount * 2);
    const bucketPool: number[][] = [];
    let bucketPoolIndex = 0;

    function acquireBucket(): number[] {
      if (bucketPoolIndex < bucketPool.length) {
        const bucket = bucketPool[bucketPoolIndex++]!;
        bucket.length = 0;
        return bucket;
      }
      const bucket: number[] = [];
      bucketPool.push(bucket);
      bucketPoolIndex++;
      return bucket;
    }

    function hashCell(cx: number, cy: number): number {
      return ((cx + 4096) << 13) | (cy + 4096);
    }

    function computeCurl(x: number, y: number, z: number) {
      const eps = 0.1;
      const psiY = (noise3D(x, y + eps, z) - noise3D(x, y - eps, z)) / (2 * eps);
      const psiX = (noise3D(x + eps, y, z) - noise3D(x - eps, y, z)) / (2 * eps);
      return { x: psiY, y: -psiX };
    }

    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(config.particleCount * 3);
    const particleVelocities: { x: number; y: number; z: number }[] = [];
    const particleSizes = new Float32Array(config.particleCount);
    const flockingForces = new Float32Array(config.particleCount * 2);

    const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const visibleWidth = visibleHeight * camera.aspect;

    for (let i = 0; i < config.particleCount; i++) {
      const x = (Math.random() - 0.5) * visibleWidth * 1.5;
      const y = (Math.random() - 0.5) * visibleHeight * 1.5;
      const z = (Math.random() - 0.5) * 100;
      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = y;
      particlePositions[i * 3 + 2] = z;
      particleVelocities.push({ x: 0, y: 0, z: 0 });
      particleSizes[i] = Math.random() < 0.3 ? 7.0 : 4.0;
    }

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: config.particleColor } },
      vertexShader: `
        attribute float size;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          float r = distance(gl_PointCoord, vec2(0.5));
          if (r > 0.5) discard;
          gl_FragColor = vec4(color, 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const maxLines = config.particleCount * 6;
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(maxLines * 6);
    const lineOpacities = new Float32Array(maxLines * 2);

    lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    lineGeometry.setAttribute(
      'opacity',
      new THREE.BufferAttribute(lineOpacities, 1).setUsage(THREE.DynamicDrawUsage),
    );

    const lineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: config.lineColor },
        uMouse: { value: new THREE.Vector3(9999, 9999, 0) },
        uRadius: { value: config.mouseRepelRadius * 1.8 },
      },
      vertexShader: `
        uniform vec3 uMouse;
        uniform float uRadius;
        attribute float opacity;
        varying float vOpacity;
        void main() {
          float dist = distance(position, uMouse);
          float baseOpacity = opacity * 0.15;
          float boost = smoothstep(uRadius, 0.0, dist);
          vOpacity = baseOpacity + (opacity * boost * 0.4);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float vOpacity;
        void main() {
          gl_FragColor = vec4(color, min(vOpacity, 0.3));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    const mouse = new THREE.Vector2(9999, 9999);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const raycaster = new THREE.Raycaster();
    const mouse3D = new THREE.Vector3();

    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      raycaster.ray.intersectPlane(plane, mouse3D);
    };
    window.addEventListener('mousemove', onMouseMove);

    let frameId: number;
    const timer = new THREE.Timer();

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      const time = timer.getElapsed() * config.timeScale;

      lineMaterial.uniforms['uMouse']?.value.copy(mouse3D);

      const positions = particles.geometry.attributes['position']!.array as Float32Array;
      flockingForces.fill(0);

      let lineIndex = 0;
      const linePosArray = lineGeometry.attributes['position']!.array as Float32Array;
      const lineOpArray = lineGeometry.attributes['opacity']!.array as Float32Array;
      const registerPair = (i: number, j: number) => {
        const i3 = i * 3;
        const j3 = j * 3;
        const dx = positions[i3]! - positions[j3]!;
        const dy = positions[i3 + 1]! - positions[j3 + 1]!;
        const dz = positions[i3 + 2]! - positions[j3 + 2]!;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq >= connectDistanceSq) {
          return;
        }

        const dist = Math.sqrt(distSq);
        if (lineIndex < maxLines) {
          const alpha = 1.0 - dist / config.connectDistance;
          const l6 = lineIndex * 6;
          const l2 = lineIndex * 2;
          linePosArray[l6] = positions[i3]!;
          linePosArray[l6 + 1] = positions[i3 + 1]!;
          linePosArray[l6 + 2] = positions[i3 + 2]!;
          linePosArray[l6 + 3] = positions[j3]!;
          linePosArray[l6 + 4] = positions[j3 + 1]!;
          linePosArray[l6 + 5] = positions[j3 + 2]!;
          lineOpArray[l2] = alpha * 0.25;
          lineOpArray[l2 + 1] = alpha * 0.25;
          lineIndex++;
        }

        if (dist <= 0.1) {
          return;
        }

        const forceCohesion = (dist / config.connectDistance) * config.cohesionForce;
        const fx = (dx / dist) * forceCohesion;
        const fy = (dy / dist) * forceCohesion;
        flockingForces[i * 2]! -= fx;
        flockingForces[i * 2 + 1]! -= fy;
        flockingForces[j * 2]! += fx;
        flockingForces[j * 2 + 1]! += fy;

        if (dist >= config.separationDistance) {
          return;
        }

        const forceSep = (1.0 - dist / config.separationDistance) * config.separationForce;
        const sx = (dx / dist) * forceSep;
        const sy = (dy / dist) * forceSep;
        flockingForces[i * 2]! += sx;
        flockingForces[i * 2 + 1]! += sy;
        flockingForces[j * 2]! -= sx;
        flockingForces[j * 2 + 1]! -= sy;
      };

      spatialBuckets.clear();
      bucketPoolIndex = 0;
      for (let i = 0; i < config.particleCount; i++) {
        const i3 = i * 3;
        const cx = Math.floor(positions[i3]! / config.connectDistance);
        const cy = Math.floor(positions[i3 + 1]! / config.connectDistance);
        cellCoords[i * 2] = cx;
        cellCoords[i * 2 + 1] = cy;
        const key = hashCell(cx, cy);
        const bucket = spatialBuckets.get(key);
        if (bucket) {
          bucket.push(i);
        } else {
          const b = acquireBucket();
          b.push(i);
          spatialBuckets.set(key, b);
        }
      }

      for (const [, bucket] of spatialBuckets) {
        const cellX = cellCoords[bucket[0]! * 2]!;
        const cellY = cellCoords[bucket[0]! * 2 + 1]!;
        for (const [offsetX, offsetY] of neighborOffsets) {
          const neighborBucket = spatialBuckets.get(hashCell(cellX + offsetX, cellY + offsetY));
          if (!neighborBucket) {
            continue;
          }

          if (offsetX === 0 && offsetY === 0) {
            for (let i = 0; i < bucket.length; i++) {
              const left = bucket[i];
              if (left === undefined) {
                continue;
              }
              for (let j = i + 1; j < bucket.length; j++) {
                const right = bucket[j];
                if (right !== undefined) {
                  registerPair(left, right);
                }
              }
            }
            continue;
          }

          for (const left of bucket) {
            for (const right of neighborBucket) {
              registerPair(left, right);
            }
          }
        }
      }

      lineGeometry.setDrawRange(0, lineIndex * 2);
      lineGeometry.attributes['position']!.needsUpdate = true;
      lineGeometry.attributes['opacity']!.needsUpdate = true;

      const visibleHeightLocal = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
      const visibleWidthLocal = visibleHeightLocal * camera.aspect;
      const boundX = visibleWidthLocal / 2 + 50;
      const boundY = visibleHeightLocal / 2 + 50;

      const isHovered = isHoveredRef.current;
      const currentNoiseScale = isHovered ? config.hoverNoiseScale : config.noiseScale;

      for (let i = 0; i < config.particleCount; i++) {
        const i3 = i * 3;
        let px = positions[i3]!;
        let py = positions[i3 + 1]!;

        const curl = computeCurl(px * currentNoiseScale, py * currentNoiseScale, time);
        const vx = curl.x * 50 * config.baseSpeed;
        const vy = curl.y * 50 * config.baseSpeed;

        const fx = flockingForces[i * 2]!;
        const fy = flockingForces[i * 2 + 1]!;

        let mx = 0;
        let my = 0;

        if (isHovered) {
          const dcx = -px;
          const dcy = -py;
          const distCenter = Math.sqrt(dcx * dcx + dcy * dcy);
          const safeDistCenter = Math.max(distCenter, 0.001);

          if (distCenter > config.centerStopRadius) {
            const strength = (distCenter - config.centerStopRadius) * 0.05 * config.centerAttractForce;
            mx = (dcx / safeDistCenter) * strength * 100;
            my = (dcy / safeDistCenter) * strength * 100;
          } else if (distCenter > 5) {
            mx = (dcy / safeDistCenter) * config.centerVortexForce * 50;
            my = (-dcx / safeDistCenter) * config.centerVortexForce * 50;
            const pushStrength = (1.0 - distCenter / config.centerStopRadius) * 20;
            mx -= (dcx / safeDistCenter) * pushStrength;
            my -= (dcy / safeDistCenter) * pushStrength;
          }

          const wave = Math.sin(time * 2 + i) * 5;
          mx += (dcy / safeDistCenter) * wave;
          my += (-dcx / safeDistCenter) * wave;
        } else {
          const dx = px - mouse3D.x;
          const dy = py - mouse3D.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < config.mouseRepelRadius * config.mouseRepelRadius) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / config.mouseRepelRadius) * config.mouseRepelForce * 100;
            const angle = Math.atan2(dy, dx);
            mx = Math.cos(angle) * force;
            my = Math.sin(angle) * force;
          }
        }

        px += (vx + fx + mx) * delta;
        py += (vy + fy + my) * delta;

        if (px > boundX) px -= boundX * 2;
        else if (px < -boundX) px += boundX * 2;
        else if (py > boundY) py -= boundY * 2;
        else if (py < -boundY) py += boundY * 2;

        positions[i3] = px;
        positions[i3 + 1] = py;
      }

      particles.geometry.attributes['position']!.needsUpdate = true;
      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      width = containerRef.current.clientWidth;
      height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(frameId);
      container.removeChild(renderer.domElement);
      renderer.dispose();
      scene.clear();
      particleGeometry.dispose();
      lineGeometry.dispose();
      particleMaterial.dispose();
      lineMaterial.dispose();
    };
  }, [profile]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.8 }}
    />
  );
}
