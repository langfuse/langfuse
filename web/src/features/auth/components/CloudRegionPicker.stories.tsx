import preview from "../../../../.storybook/preview";
import { getAvailableCloudRegionOptions } from "@/src/features/organizations/cloudRegions";
import { useState } from "react";
import { CloudRegionPicker } from "./CloudRegionPicker";

const regions = getAvailableCloudRegionOptions();

const meta = preview.meta({
  component: CloudRegionPicker,
});

function StatefulCloudRegionPicker({
  initialRegion,
  isSignUpPage,
}: {
  initialRegion: (typeof regions)[number]["name"];
  isSignUpPage?: boolean;
}) {
  const [regionName, setRegionName] = useState(initialRegion);
  const selectedRegion = regions.find((region) => region.name === regionName);

  return (
    <CloudRegionPicker
      regions={regions}
      selectedRegion={selectedRegion}
      onValueChange={setRegionName}
      isSignUpPage={isSignUpPage}
    />
  );
}

export const Default = meta.story({
  render: () => <StatefulCloudRegionPicker initialRegion="EU" />,
});

export const HipaaSignUp = meta.story({
  render: () => (
    <StatefulCloudRegionPicker initialRegion="HIPAA" isSignUpPage />
  ),
});
