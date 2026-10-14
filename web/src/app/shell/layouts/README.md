# 📦 Langfuse Layout Components

## 📌 Overview: Page - Standard Page Wrapper

`Page` is the required wrapper for all pages in our app. It ensures a **consistent layout**, a **sticky header**, and proper **scroll behavior** across different screens.
For any Langfuse single item pages, you should pass the itemType to the `Page` as a prop. Also, ideally the title should follow the format of `{itemName}: {itemId}`. If only either is reasonable, just pass it as the title. For tables, you should not pass the itemType, unless the table is part of a single item page.

**⚠️ Every page must be wrapped inside `<Page>`—do not use `<main>` directly!**

Please note that whenever content will not scale nicely to the width of the page, you should use the `ContainerPage` component instead, for example when in settings pages or set up pages.

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
import Page from "@/src/app/shell/layouts/Page";

export default function MyPage() {
  return (
    <Page
      title="My Page"
      scrollable
      headerProps={{
        breadcrumb: [{ name: "Home", href: "/" }, { name: "My Page" }],
        actionButtons: <button className="btn-primary">Save</button>,
      }}
    >
      <div>My page content here...</div>
    </Page>
  );
}
```
