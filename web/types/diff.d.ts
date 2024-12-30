declare module 'diff' {
  export type Change = {
    value: string;
    added: boolean;
    removed: boolean;
    count: number;
  };

  export function diffLines(
    oldText: string,
    newText: string,
    options?: { 
      ignoreWhitespace?: boolean; 
      ignoreNewlineAtEof?: boolean; 
      stripTrailingCr?: boolean; 
      newlineIsToken?: boolean;
    }
  ): Change[];

  export function diffJson(
    oldJson: any,
    newJson: any,
    options?: { 
      stringifyReplacer?: any;
      undefinedReplacement?: any;
    }
  ): Change[];
}
