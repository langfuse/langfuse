/** An external ID that is only fetched from the server once the user reveals it. */
export type RevealableExternalId = {
  isSet: boolean;
  value: string | undefined;
  isLoading: boolean;
  reveal: () => void;
};
