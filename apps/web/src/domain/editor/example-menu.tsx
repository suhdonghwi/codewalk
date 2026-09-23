import { ChevronDown } from "lucide-react";

import { EXAMPLES, type Example, useRunStore } from "@/domain/run/index.ts";
import { Button } from "@/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu.tsx";

interface ExampleMenuProps {
  onOpenExample: (example: Example) => void;
}

export function ExampleMenu({ onOpenExample }: ExampleMenuProps) {
  const running = useRunStore((state) => state.running);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            className="h-5 cursor-pointer rounded-sm text-neutral-500"
            data-window-control
            disabled={running}
            size="xs"
            variant="ghost"
          />
        }
      >
        Examples
        <ChevronDown aria-hidden className="size-3" data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto" data-window-control>
        {EXAMPLES.map((example) => (
          <DropdownMenuItem
            className="cursor-pointer text-xs"
            key={example.name}
            onClick={() => {
              onOpenExample(example);
            }}
          >
            {example.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
