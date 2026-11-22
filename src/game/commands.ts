import {changePosition,upgradeAbilityModel} from './engine';
import {recordCommandChange} from './command-patches';
import {releaseContract,setPlaySkill,refreshContractOffers,setPersonality,setPersonalityValues,setNationalParticipation} from './engine';
import type { Career, GameCommand,GameProgress } from './types';
import { advanceCareerSteps, advanceHalfSteps, dismissChoice, setTraining, acceptTransfer, stayAtClub, startNextSeasonSteps, retireCareer, respondToCaptainOffer,configureCheats,cheatIncreaseAttribute,manuallyAge,setAttributeLock,setAllAttributeLocks,manuallyInjureSteps } from './engine';
import { finishGameSteps, type GameSteps } from './game-steps';

export function executeCommand(career: Career, command: GameCommand, commandId: string,onProgress?:(p:GameProgress)=>void): Career {
  return finishGameSteps(commandSteps(career, command, commandId),onProgress);
}
export function* commandSteps(career: Career, command: GameCommand, commandId: string): GameSteps<Career> {
  if (!commandId || commandId.length > 160) throw new Error('잘못된 진행 요청입니다.');
  if (career.processedCommands.includes(commandId)) return career;
  let next: Career;
  switch (command.type) {
    case 'upgradeAbilities':next=upgradeAbilityModel(career);break;
    case 'changePosition':next=changePosition(career,command.position,command.style);break;
    case 'nationalParticipation':next=setNationalParticipation(career,command.key,command.checked);break;
    case 'personality':next=setPersonality(career,command.key,command.value);break;
    case 'personalitySet':next=setPersonalityValues(career,command.values);break;
    case 'refreshOffers':next=refreshContractOffers(career);break;
    case 'releaseContract':next=releaseContract(career);break;
    case 'playSkill':next=setPlaySkill(career,command.key,command.selected);break;
    case 'advance':
      if (!Number.isInteger(command.weeks) || command.weeks < 1 || command.weeks > 120) throw new Error('진행 범위는 1~120주입니다.');
      next = yield* advanceCareerSteps(career, command.weeks); break;
    case 'advanceHalf':
    case 'continueHalf': next = yield* advanceHalfSteps(career); break;
    case 'dismissChoice': next = dismissChoice(career); break;
    case 'training': next = setTraining(career, command.keys, command.intensity); break;
    case 'transfer': next = acceptTransfer(career, command.offerId); break;
    case 'captainDecision':next=respondToCaptainOffer(career,command.offerId,command.accept);break;
    case 'manualAging':next=manuallyAge(career,command.amount,command.key);break;
    case 'attributeLock':next=setAttributeLock(career,command.key,command.locked);break;
    case 'attributeLockAll':next=setAllAttributeLocks(career,command.locked);break;
    case 'manualInjury':next=yield* manuallyInjureSteps(career,command.duration);break;
    case 'cheatSettings':next=configureCheats(career,command.enabled,command.freezeAging);break;
    case 'increaseAttribute':next=cheatIncreaseAttribute(career,command.key,command.amount);break;
    case 'stay': next = stayAtClub(career); break;
    case 'nextSeason': next = yield* startNextSeasonSteps(career); break;
    case 'retire': next = retireCareer(career); break;
    default: throw new Error('지원하지 않는 진행 요청입니다.');
  }
  if(next===career)return career;
  const result={ ...next, processedCommands: [...next.processedCommands, commandId] };
  recordCommandChange(career,result,command);
  return result;
}
