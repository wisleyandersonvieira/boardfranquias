import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectFilterProps {
  label: string;
  /** Texto do gatilho quando nada está selecionado (ex.: "Todas"). */
  placeholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

/**
 * Filtro de múltipla escolha com busca. Nenhum item selecionado significa
 * "sem filtro" — é o que as funções do banco esperam de um array vazio.
 */
export function MultiSelectFilter({
  label,
  placeholder,
  options,
  selected,
  onChange,
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado",
  disabled = false,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const triggerText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? `1 selecionado`)
        : `${selected.length} selecionados`;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
              {triggerText}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {selected.length > 0 && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Limpar filtro de ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange([]);
                  }}
                  className="rounded p-0.5 hover:bg-muted"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                    className="gap-2"
                  >
                    <Checkbox checked={selected.includes(option.value)} className="pointer-events-none" />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default MultiSelectFilter;
