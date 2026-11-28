import { PILE } from "./topic-piles-geometry";
import { TopicPilesScene } from "./TopicPilesScene";

// The drawing's box in css px, centred on the piles.
const BOX = { width: 720, height: 360 };
const MIDDLE = { x: 314, y: -74 };

/** Decorative: blank piles on the floor, each as tall as its number of sheets. */
export function TopicPilesBuilding({ sheets }: TopicPilesBuildingProps) {
  return (
    <TopicPilesScene
      box={BOX}
      middle={MIDDLE}
      drop={0}
      pileCount={sheets.length}
    >
      {sheets
        .map((count, index) => (
          <TopicPilesScene.Pile
            key={index}
            x={index * PILE.pitch}
            sheets={Math.max(1, count)}
            label={null}
          />
        ))
        .reverse()}
    </TopicPilesScene>
  );
}

type TopicPilesBuildingProps = {
  /** How many sheets each pile holds, left to right. */
  sheets: readonly number[];
};
