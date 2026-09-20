import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/ui/utils.ts";

import { useCanvasStore, type WindowId } from "./store.ts";
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
        "relative overflow-hidden rounded-[6px] bg-white shadow-[0_1px_2px_rgb(0_0_0_/_4%),0_6px_18px_rgb(0_0_0_/_5%)] after:pointer-events-none after:absolute after:inset-0 after:z-[3] after:rounded-[inherit] after:border after:border-window-border after:content-['']",
        className,
      )}
      data-window-chrome
      ref={chromeRef}
      style={style}
    >
      <div
        {...titlebarProps}
        className={cn(
          "flex h-7 cursor-default items-center justify-between border-b border-[#eeeeee] pt-px pr-[5px] pl-[9px] text-xs leading-none font-medium text-neutral-500 select-none",
          titlebarClassName,
          titlebarProps?.className,
        )}
      >
        <span className="inline-flex items-center gap-1.5">
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
        className={className}
        style={style}
        title={title}
        titleAction={titleAction}
        titleIndicator={titleIndicator}
        titlebarClassName="cursor-grab active:cursor-grabbing"
        titlebarProps={titlebarProps}
      >
        {children}
      </WindowChrome>
    </div>
  );
}
