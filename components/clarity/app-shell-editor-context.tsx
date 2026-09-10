"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  type ReactNode,
} from "react";

type EditorRegistration = (id: string, active: boolean) => void;

const AppShellEditorContext = createContext<EditorRegistration | null>(null);
const AppShellConversationRouteContext =
  createContext<((active: boolean) => void) | null>(null);

export function AppShellEditorProvider({
  register,
  children,
}: {
  register: EditorRegistration;
  children: ReactNode;
}) {
  return (
    <AppShellEditorContext.Provider value={register}>
      {children}
    </AppShellEditorContext.Provider>
  );
}

export function useAppShellEditorState(active: boolean) {
  const register = useContext(AppShellEditorContext);
  const id = useId();

  useEffect(() => {
    register?.(id, active);

    return () => register?.(id, false);
  }, [active, id, register]);
}

export function AppShellConversationRouteProvider({
  register,
  children,
}: {
  register: (active: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AppShellConversationRouteContext.Provider value={register}>
      {children}
    </AppShellConversationRouteContext.Provider>
  );
}

export function useAppShellConversationRoute() {
  const register = useContext(AppShellConversationRouteContext);

  useLayoutEffect(() => {
    register?.(true);
    return () => register?.(false);
  }, [register]);
}
