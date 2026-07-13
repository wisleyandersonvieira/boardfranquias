import { useState } from "react";
import { Button } from "@/components/ui/button";
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
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Texto extra considerado na busca além do label (ex.: nome da loja). */
  keywords?: string;
}

interface SearchableSelectProps {
  label?: string;
  /** Texto do gatilho quando nada está selecionado. */
  placeholder: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Marca o gatilho como inválido (ex.: campo obrigatório sem seleção). */
  invalid?: boolean;
}

/**
 * Select de escolha única com campo de busca na primeira linha do dropdown.
 * A busca é case-insensitive e casa com qualquer parte do label/keywords.
 */
export function SearchableSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum resultado",
  disabled = false,
  invalid = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              invalid && "border-destructive"
            )}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.keywords ?? ""}`}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 shrink-0",
                        option.value === value ? "opacity-100" : "opacity-0"
                      )}
                    />
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

export default SearchableSelect;
