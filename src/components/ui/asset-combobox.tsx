import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface AssetComboboxProps {
  value: string
  onValueChange: (value: string) => void
  assets: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function AssetCombobox({
  value,
  onValueChange,
  assets,
  placeholder = "Type or select...",
  disabled = false,
  className,
}: AssetComboboxProps) {
  const [isFocused, setIsFocused] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Sync input value with prop value
  React.useEffect(() => {
    setInputValue(value)
  }, [value])

  // Show first 10 assets that match the filter
  const filteredAssets = React.useMemo(() => {
    if (!inputValue) {
      return assets.slice(0, 10)
    }
    const filtered = assets.filter((asset) =>
      asset.toLowerCase().includes(inputValue.toLowerCase())
    )
    return filtered.slice(0, 10)
  }, [assets, inputValue])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase()
    setInputValue(newValue)
    onValueChange(newValue)
  }

  const handleAssetClick = (asset: string) => {
    setInputValue(asset)
    onValueChange(asset)
    setIsFocused(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Close dropdown on Escape
    if (event.key === "Escape") {
      setIsFocused(false)
    }
    // On Enter or Tab, just close the dropdown
    if (event.key === "Enter" || event.key === "Tab") {
      setIsFocused(false)
    }
  }

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const showDropdown = isFocused && (filteredAssets.length > 0 || assets.length > 0)

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="uppercase"
      />
      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-md">
          {filteredAssets.length > 0 ? (
            <div className="p-1">
              {filteredAssets.map((asset) => (
                <div
                  key={asset}
                  onClick={() => handleAssetClick(asset)}
                  className={cn(
                    "px-2 py-1.5 text-sm rounded cursor-pointer hover:bg-accent hover:text-accent-foreground",
                    value === asset && "bg-accent"
                  )}
                >
                  {asset}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-2 text-sm text-center text-muted-foreground">
              Type to add new asset
            </div>
          )}
        </div>
      )}
    </div>
  )
}
