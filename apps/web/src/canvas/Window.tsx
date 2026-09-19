import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

import { useAppStore, type WindowId } from "@/state/store.ts";

import { useWindowDrag } from "./use-window-drag.ts";

interface CanvasWindowProps {
  id: WindowId;
  title: string;
  titleIndicator?: ReactNode;
  titleAction?: ReactNode;
  className: string;
  style?: CSSProperties | undefined;
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
      className={`window-chrome ${className}`}
      ref={chromeRef}
      style={style}
    >
      <div className="window-titlebar" {...titlebarProps}>
        <span className="window-title">
          <span>{title}</span>
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
  titleIndicator,
  titleAction,
  className,
  style,
  children,
}: CanvasWindowProps) {
  const windowState = useAppStore((state) => state.windows[id]);
  const titlebarProps = useWindowDrag(id);

  return (
    <div
      className="canvas-window-position"
      onPointerDown={() => useAppStore.getState().bringToFront(id)}
      style={{
        left: windowState.x,
        top: windowState.y,
        zIndex: windowState.z,
      }}
    >
      <WindowChrome
        className={className}
        style={style}
        title={title}
        titleAction={titleAction}
        titleIndicator={titleIndicator}
        titlebarProps={titlebarProps}
      >
        {children}
      </WindowChrome>
    </div>
  );
}
