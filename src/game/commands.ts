import {recordCommandChange} from './command-patches';
import {releaseContract,setPlaySkill} from './engine';
import type { Career, GameCommand,GameProgress } from './types';
import { advanceCareer, advanceHalf, dismissChoice, setTraining, acceptTransfer, stayAtClub, startNextSeason, retireCareer, respondToCaptainOffer,configureCheats,cheatIncreaseAttribute,manuallyAge,setAttributeLock,setAllAttributeLocks,manuallyInjure } from './engine';

export function executeCommand(career: Career, command: GameCommand, commandId: string,onProgress?:(p:GameProgress)=>void): Career {
  if (!commandId || commandId.length > 160) throw new Error('잘못된 진행 요청입니다.');
  if (career.processedCommands.includes(commandId)) return career;
  let next: Career;
  switch (command.type) {
    case 'releaseContract':next=releaseContract(career);break;
    case 'playSkill':next=setPlaySkill(career,command.key,command.selected);break;
    case 'advance':
      if (!Number.isInteger(command.weeks) || command.weeks < 1 || command.weeks > 120) throw new Error('진행 범위는 1~120주입니다.');
      next = advanceCareer(career, command.weeks,onProgress); break;
    case 'advanceHalf':
    case 'continueHalf': next = advanceHalf(career,onProgress); break;
    case 'dismissChoice': next = dismissChoice(career); break;
    case 'training': next = setTraining(career, command.keys, command.intensity); break;
    case 'transfer': next = acceptTransfer(career, command.offerId); break;
    case 'captainDecision':next=respondToCaptainOffer(career,command.offerId,command.accept);break;
    case 'manualAging':next=manuallyAge(career,command.amount,command.key);break;
    case 'attributeLock':next=setAttributeLock(career,command.key,command.locked);break;
    case 'attributeLockAll':next=setAllAttributeLocks(career,command.locked);break;
    case 'manualInjury':next=manuallyInjure(career,command.duration,onProgress);break;
    case 'cheatSettings':next=configureCheats(career,command.enabled,command.freezeAging);break;
    case 'increaseAttribute':next=cheatIncreaseAttribute(career,command.key,command.amount);break;
    case 'stay': next = stayAtClub(career); break;
    case 'nextSeason': next = startNextSeason(career,onProgress); break;
    case 'retire': next = retireCareer(career); break;
    default: throw new Error('지원하지 않는 진행 요청입니다.');
  }
  const result={ ...next, processedCommands: [...next.processedCommands, commandId] };
  recordCommandChange(career,result,command);
  return result;
}
