import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/ui/utils.ts";

import { useCanvasStore, type ResizableWindowId } from "./store.ts";
import { useWindowDrag } from "./use-window-drag.ts";
import { useWindowResize, type ResizeAxes } from "./use-window-resize.ts";

import type { Size } from "./view.ts";

const RESIZE_HANDLE = "absolute z-4 touch-none";

interface CanvasWindowProps {
  id: ResizableWindowId;
  title: string;
  titleIndicator?: ReactNode;
  titleAction?: ReactNode;
  minimumSize: Size;
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
  titlebarClassName?: string | undefined;
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
  titlebarClassName,
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
          titlebarClassName,
          titlebarProps?.className,
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

interface ResizeHandlesProps {
  minimumSize: Size;
  onResize: (size: Size, axes: ResizeAxes) => void;
  onReset?: ((axes: ResizeAxes) => void) | undefined;
}

export function ResizeHandles({
  minimumSize,
  onResize,
  onReset,
}: ResizeHandlesProps) {
  const right = useWindowResize(
    { x: true, y: false },
    minimumSize,
    onResize,
    onReset,
  );

  const bottom = useWindowResize(
    { x: false, y: true },
    minimumSize,
    onResize,
    onReset,
  );

  const corner = useWindowResize(
    { x: true, y: true },
    minimumSize,
    onResize,
    onReset,
  );

  return (
    <>
      <div
        className={`${RESIZE_HANDLE} top-titlebar right-0 bottom-3 w-1.5 cursor-ew-resize`}
        {...right}
      />
      <div
        className={`${RESIZE_HANDLE} right-3 bottom-0 left-0 h-1.5 cursor-ns-resize`}
        {...bottom}
      />
      <div
        className={`${RESIZE_HANDLE} right-0 bottom-0 size-3 cursor-nwse-resize`}
        {...corner}
      />
    </>
  );
}

export function CanvasWindow({
  id,
  title,
  titleIndicator,
  titleAction,
  minimumSize,
  children,
}: CanvasWindowProps) {
  const windowState = useCanvasStore((state) => state.windows[id]);
  const size = useCanvasStore((state) => state.sizes[id]);
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
        className="flex flex-col"
        style={{ width: size.width, height: size.height }}
        title={title}
        titleAction={titleAction}
        titleIndicator={titleIndicator}
        titlebarClassName="cursor-grab active:cursor-grabbing"
        titlebarProps={titlebarProps}
      >
        {children}
        <ResizeHandles
          minimumSize={minimumSize}
          onResize={(next) => {
            useCanvasStore.getState().resizeWindow(id, next);
          }}
        />
      </WindowChrome>
    </div>
  );
}
