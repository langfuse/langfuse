export const FullScreenPage: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => {
  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col overflow-hidden lg:h-[calc(100dvh-2rem)]">
      {children}
    </div>
  );
};
