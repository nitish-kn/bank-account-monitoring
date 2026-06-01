import { Button, Dialog, Flex, Spinner } from "@radix-ui/themes";
import React from "react";

const DialogPopup = ({
  open,
  setOpen,
  heading,
  subheading,
  children,
  successbtntxt,
  showButtons,
  onConfirm,
  confirmDisabled = false,
  isConfirming = false,
  maxWidth = "450px",
}) => {
  return (
    <main>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Content maxWidth={maxWidth}>
          <Dialog.Title>{heading}</Dialog.Title>
          <Dialog.Description size="2" mb="4" className="text-gray-500">
            {subheading}
          </Dialog.Description>

          {children}

          {showButtons && (
            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              {onConfirm ? (
                <Button disabled={confirmDisabled || isConfirming} onClick={onConfirm}>
                  {isConfirming ? (
                    <span className="flex items-center gap-2">
                      <Spinner size="1" />
                      Sending...
                    </span>
                  ) : (
                    successbtntxt
                  )}
                </Button>
              ) : (
                <Dialog.Close>
                  <Button>{successbtntxt}</Button>
                </Dialog.Close>
              )}
            </Flex>
          )}
        </Dialog.Content>
      </Dialog.Root>
    </main>
  );
};

export default DialogPopup;
