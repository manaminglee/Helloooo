import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Landing hero WebGL scene — a slowly rotating "connection globe": a wireframe
 * sphere with orbiting user nodes and light links between them, expressing
 * anonymous people connecting worldwide.
 *
 * Mobile-first: particle counts and pixel ratio scale down on small screens,
 * the loop pauses when the tab is hidden, and it no-ops under reduced motion.
 */
const HeroScene3D = ({ className = '', intensity = 1 }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 640;

    let width = mount.clientWidth || 1;
    let height = mount.clientHeight || 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 100);
    camera.position.set(0, 0, 9);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: 'low-power' });
    } catch (_) {
      return undefined; // no WebGL — the CSS gradient behind this stays visible
    }
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    mount.appendChild(renderer.domElement);

    const VIOLET = new THREE.Color(0x8b5cf6);
    const FUCHSIA = new THREE.Color(0xd946ef);
    const INDIGO = new THREE.Color(0x6366f1);
    const CYAN = new THREE.Color(0x22d3ee);

    const world = new THREE.Group();
    scene.add(world);

    // ---- wireframe globe ----
    const globe = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.6, isMobile ? 1 : 2)),
      new THREE.LineBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.16 })
    );
    world.add(globe);

    // ---- orbiting user nodes ----
    const NODE_COUNT = Math.round((isMobile ? 12 : 22) * intensity);
    const nodeGeo = new THREE.SphereGeometry(0.075, 10, 10);
    const nodes = [];
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const color = [VIOLET, FUCHSIA, INDIGO, CYAN][i % 4];
      const mesh = new THREE.Mesh(nodeGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
      // Even distribution on a sphere (golden spiral) so nodes never clump.
      const t = i / NODE_COUNT;
      const phi = Math.acos(1 - 2 * t);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 2.6;
      mesh.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      mesh.userData.pulse = Math.random() * Math.PI * 2;
      world.add(mesh);
      nodes.push(mesh);
    }

    // ---- connection links (a subset, redrawn as a single line object) ----
    const linkPairs = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (nodes[i].position.distanceTo(nodes[j].position) < 2.3) linkPairs.push([i, j]);
      }
    }
    const linkPositions = new Float32Array(linkPairs.length * 6);
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3));
    const links = new THREE.LineSegments(
      linkGeo,
      new THREE.LineBasicMaterial({ color: FUCHSIA, transparent: true, opacity: 0.22 })
    );
    world.add(links);

    const writeLinks = () => {
      linkPairs.forEach(([a, b], k) => {
        const pa = nodes[a].position;
        const pb = nodes[b].position;
        linkPositions.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], k * 6);
      });
      linkGeo.attributes.position.needsUpdate = true;
    };
    writeLinks();

    // ---- ambient dust ----
    const DUST = Math.round((isMobile ? 140 : 320) * intensity);
    const dustPos = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i += 1) {
      dustPos[i * 3] = (Math.random() - 0.5) * 26;
      dustPos[i * 3 + 1] = (Math.random() - 0.5) * 16;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 14 - 3;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({ color: 0x8b5cf6, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false })
    );
    scene.add(dust);

    // ---- interaction ----
    let targetX = 0;
    let targetY = 0;
    const onPointer = (e) => {
      const x = e.touches?.[0]?.clientX ?? e.clientX;
      const y = e.touches?.[0]?.clientY ?? e.clientY;
      if (x == null) return;
      targetX = (x / window.innerWidth - 0.5) * 2;
      targetY = (y / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onPointer, { passive: true });
    window.addEventListener('touchmove', onPointer, { passive: true });

    let scrollY = 0;
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const onResize = () => {
      width = mount.clientWidth || 1;
      height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    let running = true;

    const render = () => {
      if (!running) return;
      const t = clock.getElapsedTime();

      world.rotation.y = t * 0.075;
      world.rotation.x = Math.sin(t * 0.2) * 0.12;

      nodes.forEach((n) => {
        const s = 1 + Math.sin(t * 2 + n.userData.pulse) * 0.28;
        n.scale.setScalar(s);
      });

      dust.rotation.y = t * 0.012;

      // Mouse parallax + gentle scroll dolly.
      camera.position.x += (targetX * 1.1 - camera.position.x) * 0.045;
      camera.position.y += (-targetY * 0.7 - camera.position.y) * 0.045;
      camera.position.z = 9 + Math.min(scrollY / 220, 3);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };

    if (prefersReduced) renderer.render(scene, camera);
    else raf = requestAnimationFrame(render);

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!prefersReduced) {
        running = true;
        clock.getDelta();
        raf = requestAnimationFrame(render);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('mousemove', onPointer);
      window.removeEventListener('touchmove', onPointer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [intensity]);

  return <div ref={mountRef} className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden />;
};

export default HeroScene3D;
