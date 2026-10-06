'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {drawScene, type Camera, type Hit} from '../lib/scene';
import {furnitureFrame, type Point3} from '../lib/architecture';
import {furnitureCoordinates, houseCoordinates, intersectPlane, overviewRay, placementCoordinates, placementDragPlane, placementPoint, placementPosition, pointToFurniture, previewMove, type MoveCommand, type MoveTarget} from '../lib/arrange';
import type {World, Room} from '../lib/domain';
import type {SkyEnvironment} from '../lib/sky';

type Gesture = {x: number; y: number; yaw: number; pitch: number; moved: boolean; target: MoveTarget | null; plane: {point: Point3; normal: Point3} | null; offset: Point3; initial: MoveCommand | null};
type Props = {world: World; room: Room | null; inspect: boolean; highlight: string | null; camera: Camera; setCamera: (camera: Camera) => void; onSelect: (hit: Hit) => void; onDrop: (id: string, furnitureId: string) => void; sky: SkyEnvironment; arranging: boolean; moveTarget: MoveTarget | null; onMoveSelect: (target: MoveTarget) => void; onMove: (command: MoveCommand) => Promise<boolean>};

export default function WorldCanvas({world, room, inspect, highlight, camera, setCamera, onSelect, onDrop, sky, arranging, moveTarget, onMoveSelect, onMove}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), hits = useRef<Hit[]>([]), gesture = useRef<Gesture | null>(null), pending = useRef(false), command = useRef<MoveCommand | null>(null), [preview, setPreview] = useState<MoveCommand | null>(null), [size, setSize] = useState({w: 1000, h: 700});
  const scene = useMemo(() => preview ? previewMove(world, preview) : world, [world, preview]), sceneRoom = room ? scene.rooms.find(r => r.id === room.id) ?? null : null;
  const clear = () => {gesture.current = null; command.current = null; if (!pending.current) setPreview(null);};
  useEffect(() => {const el = canvas.current; if (!el) return; const observer = new ResizeObserver(([e]) => setSize({w: e.contentRect.width, h: e.contentRect.height})); observer.observe(el); return () => observer.disconnect();}, []);
  useEffect(() => {clear();}, [arranging, room?.id]);
  useEffect(() => {const cancel = () => clear(), key = (e: KeyboardEvent) => {if (e.key === 'Escape') clear();}; window.addEventListener('blur', cancel); window.addEventListener('keydown', key); return () => {window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key);};}, []);
  useEffect(() => {
    const el = canvas.current; if (!el) return; const dpr = Math.min(window.devicePixelRatio || 1, 2); el.width = Math.max(1, size.w * dpr); el.height = Math.max(1, size.h * dpr); const ctx = el.getContext('2d'); if (!ctx) return; ctx.scale(dpr, dpr);
    const paint = () => {hits.current = drawScene(ctx, scene, size.w, size.h, camera, sceneRoom, inspect, highlight, null, {...sky, now: sky.motion ? Date.now() : sky.now});};
    paint(); if (!sky.motion) return;
    let frame = 0, last = 0; const tick = (time: number) => {if (!document.hidden && time - last >= 40) {paint(); last = time;} frame = requestAnimationFrame(tick);}; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [scene, sceneRoom, inspect, highlight, camera, size, sky]);
  const point = (e: {clientX: number; clientY: number}) => {const r = canvas.current!.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top};};
  const matches = (h: Hit, target: MoveTarget) => target.kind === 'placement' ? h.placementId === target.id : h.kind === target.kind && h.id === target.id;
  const find = (e: {clientX: number; clientY: number}, furnitureOnly = false) => {
    const p = point(e), candidates = hits.current.filter(h => (!furnitureOnly || h.kind === 'furniture') && Math.hypot(p.x - h.x, p.y - h.y) <= Math.max(arranging ? 18 : 0, h.radius));
    return candidates.sort((a, b) => {const rank = (h: Hit) => arranging && moveTarget && matches(h, moveTarget) ? -1 : h.kind === 'object' ? 0 : h.kind === 'furniture' ? 1 : h.kind === 'room' ? 2 : 3; return rank(a) - rank(b) || Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(p.x - b.x, p.y - b.y);})[0];
  };
  const movable = (hit: Hit | undefined): MoveTarget | null => {
    if (!hit) return null;
    if (hit.placementId) return {kind: 'placement', id: hit.placementId};
    if (hit.kind === 'furniture') return {kind: 'furniture', id: hit.id};
    if (hit.kind === 'room' && world.rooms.some(r => r.id === hit.id && r.kind === 'house')) return {kind: 'room', id: hit.id};
    return null;
  };
  const begin = (target: MoveTarget, x: number, y: number) => {
    let plane: Gesture['plane'] = {point: [0, 0, 0], normal: [0, 1, 0]}, center: Point3, initial: MoveCommand;
    if (target.kind === 'room') {const r = world.rooms.find(r => r.id === target.id); if (!r || r.kind !== 'house') return null; center = [r.x, 0, r.z]; initial = {type: 'room.move', id: r.id, x: r.x, z: r.z};}
    else if (target.kind === 'furniture') {const f = world.furniture.find(f => f.id === target.id), r = world.rooms.find(r => r.id === f?.roomId); if (!f || !r) return null; const frame = furnitureFrame(r, f); center = [frame.x, 0, frame.z]; initial = {type: 'furniture.move', id: f.id, x: f.x, z: f.z};}
    else {
      const p = world.placements.find(p => p.id === target.id), f = world.furniture.find(f => f.id === p?.furnitureId), r = world.rooms.find(r => r.id === f?.roomId); if (!p || !f || !r) return null;
      const active = world.placements.filter(p => p.furnitureId === f.id && world.objects.some(o => o.id === p.objectId && !o.archived)), position = placementPosition(f, p, active.findIndex(other => other.id === p.id));
      plane = placementDragPlane(r, f); const q = intersectPlane(overviewRay(x, y, size.w, size.h, camera, room), plane.point, plane.normal); if (!q) return null;
      const local = pointToFurniture(furnitureFrame(r, f), q); center = placementPoint(f, position); initial = {type: 'placement.move', id: p.id, position};
      return {plane, offset: local.map((n, i) => n - center[i]) as Point3, initial};
    }
    const q = intersectPlane(overviewRay(x, y, size.w, size.h, camera, room), plane.point, plane.normal); return q ? {plane, offset: q.map((n, i) => n - center[i]) as Point3, initial} : null;
  };
  const move = (g: Gesture, x: number, y: number): MoveCommand | null => {
    if (!g.target || !g.plane) return null; const q = intersectPlane(overviewRay(x, y, size.w, size.h, camera, room), g.plane.point, g.plane.normal); if (!q) return null;
    if (g.target.kind === 'room') return {type: 'room.move', id: g.target.id, ...houseCoordinates(q[0] - g.offset[0], q[2] - g.offset[2])};
    const p = g.target.kind === 'placement' ? world.placements.find(p => p.id === g.target!.id) : null, f = world.furniture.find(f => f.id === (p?.furnitureId ?? g.target!.id)), r = world.rooms.find(r => r.id === f?.roomId); if (!f || !r) return null;
    if (g.target.kind === 'furniture') return {type: 'furniture.move', id: f.id, ...furnitureCoordinates(r, f, q[0] - g.offset[0], q[2] - g.offset[2])};
    const local = pointToFurniture(furnitureFrame(r, f), q).map((n, i) => n - g.offset[i]) as Point3; return {type: 'placement.move', id: g.target.id, position: placementCoordinates(f, local)};
  };
  return <canvas ref={canvas} tabIndex={0} className={arranging ? 'arrange-canvas' : ''} aria-label={arranging ? 'Arrange your space. Drag furniture or thoughts to move them; drag an empty area to rotate. Use the position controls in the furniture list for precise changes. Escape finishes arranging.' : room ? `${room.name} interior. Furniture is also accessible from the list on the right.` : 'Knowledge garden. Drag to rotate and scroll to zoom. Rooms are also accessible from Spaces.'}
    onPointerDown={e => {if (e.button !== 0 || pending.current) return; e.currentTarget.focus({preventScroll: true}); const p = point(e), target = arranging ? movable(find(e)) : null, movement = target ? begin(target, p.x, p.y) : null; if (target && movement) onMoveSelect(target); gesture.current = {x: e.clientX, y: e.clientY, yaw: camera.yaw, pitch: camera.pitch, moved: false, target: movement ? target : null, plane: movement?.plane ?? null, offset: movement?.offset ?? [0, 0, 0], initial: movement?.initial ?? null}; e.currentTarget.setPointerCapture(e.pointerId);}}
    onPointerMove={e => {const g = gesture.current; if (!g) {e.currentTarget.style.cursor = arranging && movable(find(e)) ? 'move' : find(e) ? 'pointer' : 'grab'; return;} const dx = e.clientX - g.x, dy = e.clientY - g.y; if (Math.abs(dx) + Math.abs(dy) > 5) g.moved = true; if (!g.moved) return; if (g.target) {const p = point(e), next = move(g, p.x, p.y); if (next) {command.current = next; setPreview(next);}} else setCamera({...camera, yaw: g.yaw + dx * .006, pitch: Math.max(.25, Math.min(1.1, g.pitch + dy * .004))});}}
    onPointerUp={async e => {const g = gesture.current, next = command.current; gesture.current = null; command.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (g?.moved && g.target && next && JSON.stringify(next) !== JSON.stringify(g.initial)) {pending.current = true; try {await onMove(next);} finally {pending.current = false; setPreview(null);}} else {setPreview(null); if (g && !g.moved) {const h = find(e); if (arranging) {const target = movable(h); if (target) onMoveSelect(target); else if (h?.kind === 'room') onSelect(h);} else if (h) onSelect(h);}}}}
    onPointerCancel={clear} onLostPointerCapture={() => {if (gesture.current) clear();}} onWheel={e => {if (!gesture.current) setCamera({...camera, zoom: Math.max(.55, Math.min(2, camera.zoom - e.deltaY * .001))});}} onDragOver={e => {e.preventDefault(); e.dataTransfer.dropEffect = 'copy';}} onDrop={e => {e.preventDefault(); const h = find(e, true), id = e.dataTransfer.getData('application/idea-grove'); if (id && h) onDrop(id, h.id);}} />;
}
