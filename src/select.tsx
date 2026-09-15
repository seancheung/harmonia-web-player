import {
  autoUpdate,
  FloatingFocusManager,
  FloatingPortal,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
  useTransitionStyles,
  useTypeahead,
} from "@floating-ui/react";
import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

type OptionProps = {
  value?: string | number;
  children: ReactNode;
  disabled?: boolean;
};
export function SelectOption(_props: OptionProps) {
  return null;
}
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textOf(child.props.children)
        : String(child),
    )
    .join("");
}
export function Select({
  id: controlId,
  value,
  onChange,
  children,
  disabled,
  values,
  onValuesChange,
  "aria-label": label,
}: {
  id?: string;
  value?: string | number;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  "aria-label"?: string;
}) {
  const options = Children.toArray(children)
    .filter(isValidElement<OptionProps>)
    .map((child) => ({
      value: String(child.props.value ?? textOf(child.props.children)),
      label: textOf(child.props.children),
      disabled: child.props.disabled,
    }));
  const selected = options.findIndex(
    (option) =>
      option.value === (values ? values[0] || "" : String(value ?? "")),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const list = useRef<Array<HTMLElement | null>>([]);
  const labels = useRef<Array<string | null>>([]);
  labels.current = options.map((option) =>
    option.disabled ? null : option.label,
  );
  const id = useId();
  const { refs, floatingStyles, context, placement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip(),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, availableHeight, availableWidth, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${Math.min(rects.reference.width, Math.max(0, availableWidth))}px`,
            maxWidth: `${Math.max(0, availableWidth)}px`,
            maxHeight: `${Math.max(0, Math.min(320, availableHeight))}px`,
          });
        },
      }),
    ],
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [
      useClick(context, { enabled: !disabled }),
      useDismiss(context),
      useRole(context, { role: "listbox" }),
      useListNavigation(context, {
        listRef: list,
        activeIndex: active,
        selectedIndex: selected < 0 ? null : selected,
        onNavigate: setActive,
        loop: true,
        disabledIndices: options.flatMap((option, index) =>
          option.disabled ? [index] : [],
        ),
      }),
      useTypeahead(context, {
        listRef: labels,
        activeIndex: active,
        selectedIndex: selected,
        onMatch(index) {
          if (open) setActive(index);
          else choose(index);
        },
      }),
    ],
  );
  const above = placement.startsWith("top");
  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: { open: 150, close: 100 },
    initial: {
      opacity: 0,
      transform: `scale(0.96) translateY(${above ? 4 : -4}px)`,
    },
    open: { opacity: 1, transform: "scale(1) translateY(0)" },
  });
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (values) {
      onValuesChange?.(
        option.value === ""
          ? []
          : values.includes(option.value)
            ? values.filter((value) => value !== option.value)
            : [...values, option.value],
      );
      return;
    }
    onChange({ target: { value: option.value } });
    setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        id={controlId}
        ref={refs.setReference}
        className="select-control"
        data-open={open}
        disabled={disabled}
        aria-label={label}
        aria-labelledby={label || controlId ? undefined : `${id}-value`}
        {...getReferenceProps()}
      >
        <span
          id={`${id}-value`}
          className={values?.length ? "select-tags" : "select-value"}
        >
          {values?.length
            ? values.map((value) => (
                <span className="select-tag" key={value}>
                  {options.find((option) => option.value === value)?.label ||
                    value}
                </span>
              ))
            : (options[selected]?.label ?? "")}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isMounted && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              role="listbox"
              aria-multiselectable={values ? true : undefined}
              ref={refs.setFloating}
              style={floatingStyles}
              className="select-positioner"
              aria-label={label}
              {...getFloatingProps()}
            >
              <div
                className="select-popup"
                style={{
                  ...transitionStyles,
                  maxHeight: "inherit",
                  transformOrigin: above ? "bottom" : "top",
                }}
              >
                {options.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={
                      values
                        ? option.value === ""
                          ? values.length === 0
                          : values.includes(option.value)
                        : selected === index
                    }
                    aria-disabled={option.disabled || undefined}
                    tabIndex={active === index ? 0 : -1}
                    ref={(node) => {
                      list.current[index] = node;
                    }}
                    className="select-option"
                    {...getItemProps({ onClick: () => choose(index) })}
                  >
                    <span>{option.label}</span>
                    {(values
                      ? option.value === ""
                        ? values.length === 0
                        : values.includes(option.value)
                      : selected === index) && (
                      <Check size={15} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
