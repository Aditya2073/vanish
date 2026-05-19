import { useCallback, useReducer } from 'react';
import type { ClientRegion } from '../lib/regions';
import type { Bbox } from '../schema';

type State = {
  past: ClientRegion[][];
  present: ClientRegion[];
  future: ClientRegion[][];
};

export type RegionPatch = Partial<Pick<ClientRegion, 'replacement' | 'locked' | 'bbox' | 'text'>> & { bbox?: Bbox };

type Action =
  | { type: 'SET'; regions: ClientRegion[] }
  | { type: 'ADD'; region: ClientRegion }
  | { type: 'DELETE'; id: string }
  | { type: 'UPDATE'; id: string; patch: RegionPatch }
  | { type: 'CLEAR' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

const initial: State = { past: [], present: [], future: [] };

function pushHistory(state: State, next: ClientRegion[]): State {
  return {
    past: [...state.past, state.present],
    present: next,
    future: [],
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET':
      // SET resets history — used when fresh inference completes.
      return { past: [], present: action.regions, future: [] };
    case 'ADD':
      return pushHistory(state, [...state.present, action.region]);
    case 'DELETE':
      return pushHistory(state, state.present.filter((r) => r.id !== action.id));
    case 'UPDATE':
      return pushHistory(
        state,
        state.present.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      );
    case 'CLEAR':
      if (state.present.length === 0) return state;
      return pushHistory(state, []);
    case 'UNDO': {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future],
      };
    }
    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

export function useRedaction() {
  const [state, dispatch] = useReducer(reducer, initial);

  return {
    regions: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    set: useCallback((regions: ClientRegion[]) => dispatch({ type: 'SET', regions }), []),
    add: useCallback((region: ClientRegion) => dispatch({ type: 'ADD', region }), []),
    remove: useCallback((id: string) => dispatch({ type: 'DELETE', id }), []),
    update: useCallback(
      (id: string, patch: RegionPatch) => dispatch({ type: 'UPDATE', id, patch }),
      [],
    ),
    clear: useCallback(() => dispatch({ type: 'CLEAR' }), []),
    undo: useCallback(() => dispatch({ type: 'UNDO' }), []),
    redo: useCallback(() => dispatch({ type: 'REDO' }), []),
  };
}
