import type { Abi } from "viem";
import { MultiLevelAccount__factory } from "../../../typechain-types/factories/contracts/core/MultiLevelAccount__factory";
import { Level__factory } from "../../../typechain-types/factories/contracts/core/Level__factory";
import { MultiLevelAccountFactory__factory } from "../../../typechain-types/factories/contracts/core/MultiLevelAccountFactory__factory";
import { IEntryPoint__factory } from "../../../typechain-types/factories/@account-abstraction/contracts/interfaces/IEntryPoint__factory";

export const MULTI_LEVEL_ACCOUNT_ABI = MultiLevelAccount__factory.abi as Abi;
export const LEVEL_ABI = Level__factory.abi as Abi;
export const MULTI_LEVEL_ACCOUNT_FACTORY_ABI = MultiLevelAccountFactory__factory.abi as Abi;
export const ENTRY_POINT_ABI = IEntryPoint__factory.abi as Abi;


