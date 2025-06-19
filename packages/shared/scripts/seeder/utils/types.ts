export interface SeederOptions {
  numberOfDays: number;
  numberOfRuns?: number;
  totalObservations?: number;
}

export interface DatasetItemInput {
  datasetName: string;
  itemIndex: number;
  item: any;
  runNumber?: number;
}

export interface FileContent {
  nestedJson: any;
  heavyMarkdown: string;
  chatMlJson: any;
}
