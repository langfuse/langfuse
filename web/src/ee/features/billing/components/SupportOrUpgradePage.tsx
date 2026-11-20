import { Banner } from "@/src/components/design-system/Banner/Banner";

export const SupportOrUpgradePage = () => {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Banner title="Access restricted">
          <p className="mb-2">This feature requires additional permissions</p>
          <p>
            Contact your system/project administrator for access or upgrade your
            plan. Need help? Reach out to support.
          </p>
        </Banner>
      </div>
    </div>
  );
};
