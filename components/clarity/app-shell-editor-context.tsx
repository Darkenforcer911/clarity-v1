"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  type ReactNode,
} from "react";

type EditorRegistration = (id: string, active: boolean) => void;

const AppShellEditorContext = createContext<EditorRegistration | null>(null);

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
