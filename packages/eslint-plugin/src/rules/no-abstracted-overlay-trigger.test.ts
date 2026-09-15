import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./no-abstracted-overlay-trigger.js";

const ruleOptions = {
  overlayFamilies: [
    {
      module: "@/src/components/ui/dialog",
      root: "Dialog",
      trigger: "DialogTrigger",
      contents: ["DialogContent"],
    },
    {
      module: "@/src/components/ui/alert-dialog",
      root: "AlertDialog",
      trigger: "AlertDialogTrigger",
      contents: ["AlertDialogContent"],
    },
    {
      module: "@/src/components/ui/dropdown-menu",
      root: "DropdownMenu",
      trigger: "DropdownMenuTrigger",
      contents: ["DropdownMenuContent", "DropdownMenuSubContent"],
    },
    {
      module: "@/src/components/ui/drawer",
      root: "Drawer",
      trigger: "DrawerTrigger",
      contents: ["DrawerContent"],
    },
    {
      module: "@/src/components/ui/popover",
      root: "Popover",
      trigger: "PopoverTrigger",
      contents: ["PopoverContent"],
    },
    {
      module: "@/src/components/ui/sheet",
      root: "Sheet",
      trigger: "SheetTrigger",
      contents: ["SheetContent"],
    },
  ],
  overlayControllerFamilies: [
    {
      module:
        "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController",
      root: "ConfirmationDialogController",
    },
    {
      module:
        "@/src/components/design-system/DialogController/DialogController",
      root: "DialogController",
    },
  ],
};

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-abstracted-overlay-trigger", rule, {
  valid: [
    `const value = 42;`,
    `function helper() { return <div />; }`,
    `const helper = () => <div />;`,
    `const { Component } = source;`,
    `const Component = undefined;`,
    `let Component;`,
    `function Component({ visible }) { if (visible) return <div />; return; }`,
    `function Component() { return 42; }`,
    `const Component = () => 42;`,
    `function Component({ fallback }) { if (fallback === null) return; if (!fallback) return <main />; return fallback; }`,
    `export default function () { return <main />; }`,
    `export default class Component {}`,
    `
      import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

      export function ControllerOnly() {
        return <ConfirmationDialogController />;
      }
    `,
    `
      import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

      export function ControllerOnly() {
        return <DialogController />;
      }
    `,
    `
      import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

      export function DelegatingController({ children }) {
        return (
          <DialogController>
            {({ openDialog }) => children({ openDialog })}
          </DialogController>
        );
      }
    `,
    `
      import { Dialog, DialogContent } from "@/src/components/ui/dialog";

      export function DialogController({ children }) {
        return (
          <Dialog>
            {children}
            <DialogContent />
          </Dialog>
        );
      }
    `,
    `
      import { Dialog, DialogTrigger } from "@/src/components/ui/dialog";

      export function Parent() {
        return (
          <DialogController>
            <DialogTrigger />
          </DialogController>
        );
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "@/src/components/ui/dialog";

      export function SettingsPage() {
        return (
          <main>
            <h1>Settings</h1>
            <Dialog>
              <DialogTrigger />
              <DialogContent />
            </Dialog>
          </main>
        );
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "@/src/components/ui/dialog";

      export function SettingsPage() {
        return (
          <>
            <Header />
            <Dialog>
              <DialogTrigger />
              <DialogContent />
            </Dialog>
          </>
        );
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "somewhere-else";

      export function UnrelatedComponent() {
        return (
          <Dialog>
            <DialogTrigger />
            <DialogContent />
          </Dialog>
        );
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "@/src/components/ui/dialog";

      export function Conditional({ embedded }) {
        if (embedded) {
          return (
            <main>
              <Header />
              <Dialog>
                <DialogTrigger />
                <DialogContent />
              </Dialog>
            </main>
          );
        }

        return <Dialog><DialogContent /></Dialog>;
      }
    `,
    `
      import Dialog, * as DialogComponents from "@/src/components/ui/dialog";
      import { "Dialog" as Modal } from "@/src/components/ui/dialog";

      export function MemberRoot() {
        return <DialogComponents.Dialog />;
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "@/src/components/ui/dialog";

      export function TextWrapper() {
        return <div>Label<Dialog><DialogTrigger /><DialogContent /></Dialog></div>;
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "@/src/components/ui/dialog";

      export function SpreadWrapper({ children }) {
        return <div>{...children}<Dialog><DialogTrigger /><DialogContent /></Dialog></div>;
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "@/src/components/ui/dialog";

      export function Incomplete({ visible }) {
        return visible ? null : <Dialog><DialogTrigger /></Dialog>;
      }
    `,
    `
      import {
        Dialog,
        DialogContent,
        DialogTrigger,
      } from "@/src/components/ui/dialog";

      export function TryAndSwitch({ state }) {
        try {
          switch (state) {
            case "content":
              return <Dialog><DialogContent /></Dialog>;
            default:
              return <main />;
          }
        } catch {
          return <aside />;
        } finally {
          cleanup();
        }
      }
    `,
  ].map((test) =>
    typeof test === "string" ? { code: test, options: [ruleOptions] } : test,
  ),
  invalid: [
    {
      code: `
        import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

        export function DeletePrompt() {
          return (
            <DialogController>
              {() => <><button>Delete</button></>}
            </DialogController>
          );
        }
      `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
        import { DialogController } from "@/src/components/design-system/DialogController/DialogController";

        export function DeletePrompt() {
          return (
            <DialogController>
              {({ openDialog }) => <button onClick={openDialog}>Delete</button>}
            </DialogController>
          );
        }
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "DialogController" },
        },
      ],
    },
    {
      code: `
        import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

        export function ArchiveButton({ children }) {
          return (
            <ConfirmationDialogController>
              {({ openDialog }) => <button onClick={openDialog}>Archive</button>}
            </ConfirmationDialogController>
          );
        }
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "ConfirmationDialogController" },
        },
      ],
    },
    {
      code: `
        import {
          Drawer,
          DrawerContent,
          DrawerTrigger,
        } from "@/src/components/ui/drawer";

        export function AnnotateDrawer() {
          return (
            <Drawer>
              <DrawerTrigger />
              <DrawerContent />
            </Drawer>
          );
        }
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "Drawer" },
        },
      ],
    },
    {
      code: `
            import {
              Dialog,
          DialogContent,
          DialogTrigger,
        } from "@/src/components/ui/dialog";

        export function DeleteButton() {
          return (
            <Dialog>
              <DialogTrigger />
              <DialogContent />
            </Dialog>
          );
        }
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "Dialog" },
        },
      ],
    },
    {
      code: `
        import {
          Dialog,
          DialogContent,
          DialogTrigger,
        } from "@/src/components/ui/dialog";

        export function DeleteButton() {
          return (
            <Dialog>
              <><DialogTrigger /></>
              <DialogContent />
            </Dialog>
          );
        }
      `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
        import {
          Dialog as Modal,
          DialogContent as ModalContent,
          DialogTrigger as ModalTrigger,
        } from "@/src/components/ui/dialog";

        export const DeleteButton = () => (
          <Modal>
            <ModalTrigger />
            <ModalContent />
          </Modal>
        );
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "Dialog" },
        },
      ],
    },
    {
      code: `
        import {
          Dialog,
          DialogContent,
          DialogTrigger,
        } from "@/src/components/ui/dialog";

        export function DeleteButton() {
          return (
            <div className="wrapper">
              <Dialog>
                <DialogTrigger />
                <DialogContent />
              </Dialog>
            </div>
          );
        }
          `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
            import {
              Dialog,
              DialogContent,
              DialogTrigger,
            } from "@/src/components/ui/dialog";

            export function DeleteButton({ visible }) {
              const overlay = (
                <Dialog>
                  <DialogTrigger />
                  <DialogContent />
                </Dialog>
              );
              if (visible) return overlay;
              return null;
            }
          `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
            import {
              Dialog,
          DialogContent,
          DialogTrigger,
        } from "@/src/components/ui/dialog";

        export function DeleteButton() {
          return (
            <section>
              <div>
                <Dialog>
                  <DialogTrigger />
                  <DialogContent />
                </Dialog>
              </div>
            </section>
          );
        }
      `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
        import {
          Dialog,
          DialogContent,
          DialogTrigger,
        } from "@/src/components/ui/dialog";

        export function DeleteButton() {
          return (
            <>
              <Dialog>
                <DialogTrigger />
                <DialogContent />
              </Dialog>
            </>
          );
        }
      `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
        import {
          DropdownMenu,
          DropdownMenuContent,
          DropdownMenuTrigger,
        } from "@/src/components/ui/dropdown-menu";

        export const ActionsMenu = forwardRef(() => {
          return (
            <DropdownMenu>
              <DropdownMenuTrigger />
              <DropdownMenuContent />
            </DropdownMenu>
          );
        });
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "DropdownMenu" },
        },
      ],
    },
    {
      code: `
        import {
          Sheet,
          SheetContent,
          SheetTrigger,
        } from "@/src/components/ui/sheet";

        export function MobileFilters({ loading }) {
          return loading ? <Spinner /> : (
            <Sheet>
              <SheetTrigger />
              <SheetContent />
            </Sheet>
          );
        }
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "Sheet" },
        },
      ],
    },
    {
      code: `
        import {
          Dialog,
          DialogContent,
          DialogTrigger,
        } from "@/src/components/ui/dialog";

        export default () => (
          <div>
            {/* transparent */}
            {<Dialog>
              {enabled && <DialogTrigger />}
              {enabled ? <DialogContent /> : null}
            </Dialog>}
          </div>
        );
      `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
        import {
          Popover,
          PopoverContent,
          PopoverTrigger,
        } from "@/src/components/ui/popover";

        export function Picker({ ready }) {
          return ready && (
            <Popover>
              <PopoverTrigger />
              <PopoverContent />
            </Popover>
          );
        }
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "Popover" },
        },
      ],
    },
    {
      code: `
        import {
          AlertDialog,
          AlertDialogContent,
          AlertDialogTrigger,
        } from "@/src/components/ui/alert-dialog";

        export function Confirm() {
          return (
            <AlertDialog>
              <AlertDialogTrigger />
              <AlertDialogContent />
            </AlertDialog>
          ) as JSX.Element;
        }
      `,
      errors: [
        {
          messageId: "abstractedTrigger",
          data: { overlay: "AlertDialog" },
        },
      ],
    },
    {
      code: `
          import {
            Dialog,
            DialogContent,
            DialogTrigger,
          } from "@/src/components/ui/dialog";

          export function DeleteButton() {
            return (
              <div>
                <Dialog>
                  <DialogTrigger />
                  <DialogContent />
                </Dialog>
                {null}
                {false}
                {true}
                {undefined}
              </div>
            );
          }
        `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
          import {
            Dialog,
            DialogContent,
            DialogTrigger,
          } from "@/src/components/ui/dialog";

          export function DeleteButton() {
            let mutableOverlay = null;
            const { ignored } = source;
            const overlay = (
              <Dialog>
                <DialogTrigger />
                <DialogContent />
              </Dialog>
            );
            return overlay;
          }
        `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
    {
      code: `
          import {
            Dialog,
            DialogContent,
            DialogTrigger,
          } from "@/src/components/ui/dialog";

          export default function DeleteButton() {
            return (
              <Dialog>
                <DialogTrigger />
                <DialogContent />
              </Dialog>
            );
          }
        `,
      errors: [{ messageId: "abstractedTrigger" }],
    },
  ].map((test) => ({
    ...test,
    errors: test.errors.map((error) => ({
      ...error,
      messageId: "abstractedTrigger" as const,
    })),
    options: [ruleOptions],
  })),
});
