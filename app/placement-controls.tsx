'use client';
import {BookOpen, Move, StickyNote, Trash2} from 'lucide-react';
import {placementPosition} from '../lib/arrange';
import type {Furniture, KnowledgeObject, Placement} from '../lib/domain';

export default function PlacementControls({object, placement, furniture, index, readOnly, selected, onOpen, onArrange, onCoordinate}: {object: KnowledgeObject; placement: Placement; furniture: Furniture; index: number; readOnly: boolean; selected: boolean; onOpen: () => void; onArrange: () => void; onDelete: () => void; onCoordinate: (axis: 'u' | 'v', value: number) => void}) {
  const position = placementPosition(furniture, placement, index);
  const update = (axis: 'u' | 'v', value: string) => {const n = Number(value); if (!value.trim() || !Number.isFinite(n) || n < -1 || n > 1 || n === position[axis]) return; onCoordinate(axis, furniture.kind === 'shelf' && axis === 'v' ? Math.round(n) : n);};
  return <div className={selected ? 'placed-item moving' : 'placed-item'}>
    <div className="placed-item-top"><button className="placed-title" onClick={onOpen}>{object.kind === 'book' ? <BookOpen size={13}/> : <StickyNote size={13}/>}<span>{object.title || 'Untitled'}</span>{object.archived && <small>Archived</small>}</button>{!readOnly && <div className="placement-actions"><button className="placement-move" title="Adjust this placement" aria-label={`Adjust position of ${object.title || 'Untitled'}`} aria-pressed={selected} onClick={onArrange}><Move size={13}/></button><button className="icon-button danger" title="Remove this placement" aria-label={`Remove ${object.title || 'Untitled'} from this furniture`} onClick={onDelete}><Trash2 size={13}/></button></div>}</div>
    {selected && !readOnly && <div className="placement-position"><label>Across<input type="number" min={-1} max={1} step={.05} defaultValue={position.u} key={placement.id + 'u' + position.u} onBlur={e => update('u', e.target.value)}/></label>{furniture.kind === 'shelf' ? <label>Shelf<select value={position.v} onChange={e => update('v', e.target.value)}><option value={-1}>Bottom</option><option value={0}>Middle</option><option value={1}>Top</option></select></label> : <label>{furniture.kind === 'wall' ? 'Height' : 'Depth'}<input type="number" min={-1} max={1} step={.05} defaultValue={position.v} key={placement.id + 'v' + position.v} onBlur={e => update('v', e.target.value)}/></label>}</div>}
  </div>;
}
