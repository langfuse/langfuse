import { PILE, PILE_COLORS } from "./topic-piles-geometry";
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
      edges={{
        xs: sheets.flatMap((_, index) => [
          index * PILE.pitch,
          index * PILE.pitch + PILE.width,
        ]),
        ys: [0, PILE.depth],
      }}
    >
      {sheets
        .map((count, index) => (
          <TopicPilesScene.Pile
            key={index}
            rect={{
              x: index * PILE.pitch,
              y: 0,
              width: PILE.width,
              depth: PILE.depth,
            }}
            sheets={Math.max(1, count)}
            color={PILE_COLORS[index % PILE_COLORS.length]}
            label={null}
            lift={0}
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
