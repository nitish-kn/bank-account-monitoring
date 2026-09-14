import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/**
 * A panel that slides in from an edge of the screen. Built on Radix's
 * unstyled Dialog primitive rather than @radix-ui/themes' Dialog, so it
 * gets focus trapping, ESC-to-close, scroll lock, and a portal for free
 * without inheriting the centered-modal styling that isn't wanted here.
 *
 * `size` is the panel's width for a left/right drawer, or its height for
 * a top/bottom one -- whichever dimension the slide direction doesn't
 * already stretch to fill.
 */
// Use the controlled `open` state to drive the actual transform. Tailwind's
// data-state variants can be flaky here when the drawer is mounted with a
// fixed transform starting point, so this keeps the transition explicit and
// smooth for all four directions.
const EDGE_CLASSES = {
  left: "inset-y-0 left-0 h-full",
  right: "inset-y-0 right-0 h-full",
  top: "inset-x-0 top-0 w-full",
  bottom: "inset-x-0 bottom-0 w-full",
};

const getDrawerTransform = (direction, isOpen) => {
  if (direction === "left") return isOpen ? "translateX(0%)" : "translateX(-100%)";
  if (direction === "right") return isOpen ? "translateX(0%)" : "translateX(100%)";
  if (direction === "top") return isOpen ? "translateY(0%)" : "translateY(-100%)";
  if (direction === "bottom") return isOpen ? "translateY(0%)" : "translateY(100%)";
  return "translateX(0%)";
};

const CustomDrawer = ({
  open,
  setOpen,
  direction = "right",
  size = "360px",
  title,
  description,
  showClose = true,
  closeOnOverlayClick = true,
  className = "",
  children,
}) => {
  const isHorizontal = direction === "left" || direction === "right";
  const sizeStyle = isHorizontal ? { width: size } : { height: size };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 opacity-0 transition-opacity duration-300 data-[state=open]:opacity-100" />
        <Dialog.Content
          style={{
            ...sizeStyle,
            transform: getDrawerTransform(direction, open),
          }}
          onPointerDownOutside={(event) => {
            if (!closeOnOverlayClick) event.preventDefault();
          }}
          className={`fixed z-50 flex flex-col bg-white shadow-xl transition-transform duration-300 ease-in-out ${EDGE_CLASSES[direction]} ${className}`}
        >
          {(title || showClose) && (
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div>
                {title && <Dialog.Title className="text-sm font-semibold text-gray-900">{title}</Dialog.Title>}
                {description && (
                  <Dialog.Description className="text-xs text-gray-500">{description}</Dialog.Description>
                )}
              </div>
              {showClose && (
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CustomDrawer;
