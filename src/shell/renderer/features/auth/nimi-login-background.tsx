import { useEffect, useRef } from 'react';
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

type Particle = {
  x: number;
  y: number;
  z: number;
  radius: number;
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
  return Boolean(canvas.getContext('2d'));
}

function randomParticle(width: number, height: number): Particle {
  return {
    x: (Math.random() - 0.5) * width * 1.5,
    y: (Math.random() - 0.5) * height * 1.5,
    z: (Math.random() - 0.5) * 100,
    // Sized to match the Nimi desktop boot particles' perceived size (diameter ~2.1/1.2 CSS px).
    radius: Math.random() < 0.3 ? 1.05 : 0.6,
  };
}

function hashCell(cx: number, cy: number): number {
  return ((cx + 4096) << 13) | (cy + 4096);
}

export function NimiLoginBackground({
  isLogoHovered = false,
  profile = 'desktop',
}: {
  isLogoHovered?: boolean;
  profile?: NimiLoginBackgroundProfile;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isHoveredRef = useRef(isLogoHovered);

  useEffect(() => {
    isHoveredRef.current = isLogoHovered;
  }, [isLogoHovered]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    if (!shouldEnableNimiLoginBackground({
      document: window.document,
      matchMedia: window.matchMedia?.bind(window),
      navigator: window.navigator,
    })) {
      return;
    }

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      return;
    }
    const canvasElement = canvas;
    const containerElement = container;
    const drawingContext = context;

    const particleColor = readResolvedColorToken(containerElement, '--nimi-status-info');
    const lineColor = readResolvedColorToken(containerElement, '--nimi-text-inverse');
    if (!particleColor || !lineColor) {
      return;
    }
    const resolvedParticleColor = particleColor;
    const resolvedLineColor = lineColor;

    const config = resolveParticleConfig(profile);
    const particles = Array.from({ length: config.particleCount }, () => (
      randomParticle(containerElement.clientWidth || 1, containerElement.clientHeight || 1)
    ));
    const flockingForces = new Float32Array(config.particleCount * 2);
    const cellCoords = new Int32Array(config.particleCount * 2);
    const spatialBuckets = new Map<number, number[]>();
    const bucketPool: number[][] = [];
    const neighborOffsets = [
      [0, 0],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const;
    const noise3D = createNoise3D();
    const mouse = { x: 9999, y: 9999 };
    const connectDistanceSq = config.connectDistance * config.connectDistance;
    let width = 0;
    let height = 0;
    let frameId = 0;
    let lastFrame = performance.now();
    let bucketPoolIndex = 0;

    function resizeCanvas() {
      width = Math.max(1, containerElement.clientWidth);
      height = Math.max(1, containerElement.clientHeight);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvasElement.width = Math.floor(width * pixelRatio);
      canvasElement.height = Math.floor(height * pixelRatio);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

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

    function computeCurl(x: number, y: number, z: number) {
      const eps = 0.1;
      const psiY = (noise3D(x, y + eps, z) - noise3D(x, y - eps, z)) / (2 * eps);
      const psiX = (noise3D(x + eps, y, z) - noise3D(x - eps, y, z)) / (2 * eps);
      return { x: psiY, y: -psiX };
    }

    function registerPair(leftIndex: number, rightIndex: number) {
      const left = particles[leftIndex]!;
      const right = particles[rightIndex]!;
      const dx = left.x - right.x;
      const dy = left.y - right.y;
      const dz = left.z - right.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq >= connectDistanceSq) {
        return;
      }

      const dist = Math.sqrt(distSq);
      const alpha = 1 - dist / config.connectDistance;
      drawingContext.globalAlpha = Math.min(0.3, alpha * 0.18);
      drawingContext.beginPath();
      drawingContext.moveTo(width / 2 + left.x, height / 2 + left.y);
      drawingContext.lineTo(width / 2 + right.x, height / 2 + right.y);
      drawingContext.stroke();

      if (dist <= 0.1) {
        return;
      }

      const forceCohesion = (dist / config.connectDistance) * config.cohesionForce;
      const fx = (dx / dist) * forceCohesion;
      const fy = (dy / dist) * forceCohesion;
      flockingForces[leftIndex * 2]! -= fx;
      flockingForces[leftIndex * 2 + 1]! -= fy;
      flockingForces[rightIndex * 2]! += fx;
      flockingForces[rightIndex * 2 + 1]! += fy;

      if (dist >= config.separationDistance) {
        return;
      }

      const forceSep = (1 - dist / config.separationDistance) * config.separationForce;
      const sx = (dx / dist) * forceSep;
      const sy = (dy / dist) * forceSep;
      flockingForces[leftIndex * 2]! += sx;
      flockingForces[leftIndex * 2 + 1]! += sy;
      flockingForces[rightIndex * 2]! -= sx;
      flockingForces[rightIndex * 2 + 1]! -= sy;
    }

    function rebuildSpatialBuckets() {
      spatialBuckets.clear();
      bucketPoolIndex = 0;
      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i]!;
        const cx = Math.floor(particle.x / config.connectDistance);
        const cy = Math.floor(particle.y / config.connectDistance);
        cellCoords[i * 2] = cx;
        cellCoords[i * 2 + 1] = cy;
        const key = hashCell(cx, cy);
        const bucket = spatialBuckets.get(key);
        if (bucket) {
          bucket.push(i);
        } else {
          const next = acquireBucket();
          next.push(i);
          spatialBuckets.set(key, next);
        }
      }
    }

    function drawConnections() {
      drawingContext.strokeStyle = resolvedLineColor;
      drawingContext.lineWidth = 1;
      for (const bucket of spatialBuckets.values()) {
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
      drawingContext.globalAlpha = 1;
    }

    function updateParticles(delta: number, time: number) {
      const boundX = width / 2 + 50;
      const boundY = height / 2 + 50;
      const isHovered = isHoveredRef.current;
      const currentNoiseScale = isHovered ? config.hoverNoiseScale : config.noiseScale;

      for (let i = 0; i < particles.length; i++) {
        const particle = particles[i]!;
        const curl = computeCurl(particle.x * currentNoiseScale, particle.y * currentNoiseScale, time);
        const vx = curl.x * 50 * config.baseSpeed;
        const vy = curl.y * 50 * config.baseSpeed;
        const fx = flockingForces[i * 2]!;
        const fy = flockingForces[i * 2 + 1]!;
        let mx = 0;
        let my = 0;

        if (isHovered) {
          const dcx = -particle.x;
          const dcy = -particle.y;
          const distCenter = Math.sqrt(dcx * dcx + dcy * dcy);
          const safeDistCenter = Math.max(distCenter, 0.001);

          if (distCenter > config.centerStopRadius) {
            const strength = (distCenter - config.centerStopRadius) * 0.05 * config.centerAttractForce;
            mx = (dcx / safeDistCenter) * strength * 100;
            my = (dcy / safeDistCenter) * strength * 100;
          } else if (distCenter > 5) {
            mx = (dcy / safeDistCenter) * config.centerVortexForce * 50;
            my = (-dcx / safeDistCenter) * config.centerVortexForce * 50;
            const pushStrength = (1 - distCenter / config.centerStopRadius) * 20;
            mx -= (dcx / safeDistCenter) * pushStrength;
            my -= (dcy / safeDistCenter) * pushStrength;
          }

          const wave = Math.sin(time * 2 + i) * 5;
          mx += (dcy / safeDistCenter) * wave;
          my += (-dcx / safeDistCenter) * wave;
        } else {
          const dx = particle.x - mouse.x;
          const dy = particle.y - mouse.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < config.mouseRepelRadius * config.mouseRepelRadius) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / config.mouseRepelRadius) * config.mouseRepelForce * 100;
            const angle = Math.atan2(dy, dx);
            mx = Math.cos(angle) * force;
            my = Math.sin(angle) * force;
          }
        }

        particle.x += (vx + fx + mx) * delta;
        particle.y += (vy + fy + my) * delta;

        if (particle.x > boundX) particle.x -= boundX * 2;
        else if (particle.x < -boundX) particle.x += boundX * 2;
        else if (particle.y > boundY) particle.y -= boundY * 2;
        else if (particle.y < -boundY) particle.y += boundY * 2;
      }
    }

    function drawParticles() {
      drawingContext.fillStyle = resolvedParticleColor;
      drawingContext.globalAlpha = 0.8;
      for (const particle of particles) {
        drawingContext.beginPath();
        drawingContext.arc(width / 2 + particle.x, height / 2 + particle.y, particle.radius, 0, Math.PI * 2);
        drawingContext.fill();
      }
      drawingContext.globalAlpha = 1;
    }

    function animate(now: number) {
      frameId = requestAnimationFrame(animate);
      const delta = Math.min((now - lastFrame) / 1000, 0.05);
      const time = (now / 1000) * config.timeScale;
      lastFrame = now;

      flockingForces.fill(0);
      drawingContext.clearRect(0, 0, width, height);
      rebuildSpatialBuckets();
      drawConnections();
      updateParticles(delta, time);
      drawParticles();
    }

    const onMouseMove = (event: MouseEvent) => {
      const rect = containerElement.getBoundingClientRect();
      mouse.x = event.clientX - rect.left - width / 2;
      mouse.y = event.clientY - rect.top - height / 2;
    };
    const onMouseLeave = () => {
      mouse.x = 9999;
      mouse.y = 9999;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    frameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      cancelAnimationFrame(frameId);
      drawingContext.clearRect(0, 0, width, height);
    };
  }, [profile]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.8 }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="h-full w-full" />
    </div>
  );
}
