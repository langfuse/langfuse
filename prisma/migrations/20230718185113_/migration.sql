-- CreateTable
CREATE TABLE "wallets" (
    "id" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "coldkeyId" TEXT NOT NULL,
    "hotkeyId" TEXT NOT NULL,
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "neuronsId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coldkeys" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ss58" TEXT NOT NULL,
    "pubfile" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "coldkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotkeys" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ss58" TEXT NOT NULL,
    "pubfile" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "hotkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neurons" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "rank" INTEGER NOT NULL,
    "stake" INTEGER NOT NULL,
    "emission" INTEGER NOT NULL,
    "incentive" INTEGER NOT NULL,
    "consensus" INTEGER NOT NULL,
    "trust" INTEGER NOT NULL,

    CONSTRAINT "neurons_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_coldkeyId_fkey" FOREIGN KEY ("coldkeyId") REFERENCES "coldkeys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_hotkeyId_fkey" FOREIGN KEY ("hotkeyId") REFERENCES "hotkeys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_neuronsId_fkey" FOREIGN KEY ("neuronsId") REFERENCES "neurons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coldkeys" ADD CONSTRAINT "coldkeys_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotkeys" ADD CONSTRAINT "hotkeys_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neurons" ADD CONSTRAINT "neurons_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
