import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/ui/utils.ts";

import { useCanvasStore, type WindowId } from "./store.ts";
import { useWindowDrag } from "./use-window-drag.ts";

interface CanvasWindowProps {
  id: WindowId;
  title: string;
  titleAction?: ReactNode;
  className: string;
  children: ReactNode;
}

interface WindowChromeProps {
  title: string;
  titleIndicator?: ReactNode;
  titleAction?: ReactNode;
  className: string;
  children?: ReactNode;
  style?: CSSProperties | undefined;
  chromeRef?: Ref<HTMLElement> | undefined;
  titlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
}

export function WindowChrome({
  title,
  titleIndicator,
  titleAction,
  className,
  children,
  style,
  chromeRef,
  titlebarProps,
}: WindowChromeProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-md bg-white shadow-window after:pointer-events-none after:absolute after:inset-0 after:z-3 after:rounded-[inherit] after:border after:border-window-border",
        className,
      )}
      data-window-chrome
      ref={chromeRef}
      style={style}
    >
      <div
        {...titlebarProps}
        className={cn(
          "flex h-titlebar flex-none cursor-default items-center justify-between border-b border-window-border pt-px pr-1 pl-2 text-xs leading-none font-medium text-neutral-500 select-none",
          titlebarProps !== undefined && "cursor-grab active:cursor-grabbing",
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="font-code">{title}</span>
          {titleIndicator}
        </span>
        {titleAction}
      </div>
      {children}
    </section>
  );
}

export function CanvasWindow({
  id,
  title,
  titleAction,
  className,
  children,
}: CanvasWindowProps) {
  const windowState = useCanvasStore((state) => state.windows[id]);
  const titlebarProps = useWindowDrag(id);

  return (
    <div
      className="absolute"
      onPointerDown={() => useCanvasStore.getState().bringToFront(id)}
      style={{
        left: windowState.x,
        top: windowState.y,
        zIndex: windowState.z,
      }}
    >
      <WindowChrome
        className={cn("flex flex-col", className)}
        title={title}
        titleAction={titleAction}
        titlebarProps={titlebarProps}
      >
        {children}
      </WindowChrome>
    </div>
  );
}
