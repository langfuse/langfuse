const fail = () => {
  throw new Error(
    "Prisma is server-only and must not be used in Storybook browser stories.",
  );
};

const enumLike = new Proxy(
  {},
  {
    get: (_target, prop) => (typeof prop === "symbol" ? undefined : String(prop)),
    getOwnPropertyDescriptor: (_target, prop) => ({
      configurable: true,
      enumerable: true,
      value: String(prop),
    }),
    ownKeys: () => ["PLACEHOLDER"],
  },
);

const PrismaClient = new Proxy(function PrismaClient() {}, {
  apply: fail,
  construct: fail,
});

module.exports = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === "__esModule") return false;
      if (prop === "default") return undefined;
      if (prop === "PrismaClient") return PrismaClient;
      if (typeof prop === "symbol") return undefined;

      return enumLike;
    },
  },
);
