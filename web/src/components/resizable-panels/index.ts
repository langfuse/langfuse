/**
 * Resizable Panels - Reusable collapsible panel system
 *
 * Features:
 * - Remember last width on collapse/expand
 * - Context-based state management
 * - localStorage persistence via autoSaveId
 * - Imperative API for programmatic control
 * - Type-safe with full TypeScript support
 *
 * Usage:
 * ```tsx
 * <CollapsiblePanelGroup direction="horizontal" autoSaveId="my-layout">
 *   <CollapsiblePanel id="sidebar" defaultSize={30}>
 *     <Sidebar />
 *   </CollapsiblePanel>
 *
 *   <CollapsiblePanelHandle withHandle />
 *
 *   <CollapsiblePanel id="main" defaultSize={70}>
 *     <MainContent />
 *   </CollapsiblePanel>
 * </CollapsiblePanelGroup>
 * ```
 */

// Context and hooks
export { useCollapsiblePanel } from "./contexts/CollapsiblePanelContext";
export { usePanelSizeMemory } from "./hooks/usePanelSizeMemory";

// Components
export { CollapsiblePanelGroup } from "./components/CollapsiblePanelGroup";
export {
  CollapsiblePanel,
  type CollapsiblePanelHandle,
} from "./components/CollapsiblePanel";
export { CollapsiblePanelHandle } from "./components/CollapsiblePanelHandle";
