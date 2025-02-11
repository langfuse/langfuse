# 📦 Langfuse Layout Components

## 📌 Overview: PageContainer - Standard Page Wrapper

`PageContainer` is the required wrapper for all pages in our app. It ensures a **consistent layout**, a **sticky header**, and proper **scroll behavior** across different screens.
For any Langfuse single item pages, you should pass the itemType to the `PageContainer` as a prop. Also, ideally the title should follow the format of `{itemName}: {itemId}`. If only either is reasonable, just pass it as the title. For tables, you should not pass the itemType, unless the table is part of a single item page.

**⚠️ Every page must be wrapped inside `<PageContainer>`—do not use `<main>` directly!**

Please note that for settings pages, and settings pages only, you should use the `SettingsContainer` component instead.

---

## ✨ Features

✅ **Encapsulated Sticky Header** → Prevents inconsistent layouts  
✅ **Manages Scrolling** → Supports both `"content-scroll"` and `"page-scroll"`  
✅ **Standardized Padding & Layout** → Avoids manual style fixes  
✅ **Breadcrumb Support** → Enables easy navigation  
✅ **Custom Header Actions** → Pass buttons, links, or other elements

---

## 🚀 Usage

### **Basic Example**

```tsx
import PageContainer from "@/src/components/layouts/PageContainer";

export default function MyPage() {
  return (
    <PageContainer
      title="My Page"
      scrollable
      headerProps={{
        breadcrumb: [{ name: "Home", href: "/" }, { name: "My Page" }],
        actionButtons: <button className="btn-primary">Save</button>,
      }}
    >
      <div>My page content here...</div>
    </PageContainer>
  );
}
```
