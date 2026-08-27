import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";

import rule from "./no-abstracted-overlay-trigger.js";

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
  ],
  invalid: [
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
  ],
});
