import { DimToken } from '../../../entities/DimToken';

export interface NormalizedTokenInput {
    key: string;
    symbol: string;
    name: string;
    type: 'Native' | 'LP' | 'Stablecoin' | 'ForeignAsset' | 'DexShare' | 'Other';
    decimals: number;
    rawData: any;
}

export interface ITokenRepository {
    upsertToken(input: NormalizedTokenInput): Promise<DimToken>;
}

export interface ITokenValidator {
    validateInput(input: NormalizedTokenInput): void;
}

export interface ITokenFactory {
    normalizeInput(rawInput: any): NormalizedTokenInput;
}
