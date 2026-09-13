-- CreateEnum
CREATE TYPE "StickerNumberFormat" AS ENUM ('verbatim', 'stripLeadingZeros', 'zeroPadded');

-- DropIndex
DROP INDEX "articles_name_trgm_idx";

-- CreateTable
CREATE TABLE "sticker_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "praefix" TEXT NOT NULL,
    "trenner" TEXT NOT NULL DEFAULT ' ',
    "anker_begriffe" TEXT[],
    "extraktions_muster" TEXT[],
    "ausschluss_muster" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "zahlen_format" "StickerNumberFormat" NOT NULL DEFAULT 'verbatim',
    "pad_length" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sticker_profiles_pkey" PRIMARY KEY ("id")
);
