export const numberFormatter = (number: number) => {
  return Intl.NumberFormat("us").format(number).toString();
};
