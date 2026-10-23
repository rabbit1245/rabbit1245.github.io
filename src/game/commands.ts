import type { Career, GameCommand } from './types';
import { advanceCareer, advanceHalf, dismissChoice, setTraining, acceptTransfer, stayAtClub, startNextSeason, retireCareer, respondToCaptainOffer,configureCheats,cheatIncreaseAttribute,manuallyAge,setAttributeLock,manuallyInjure } from './engine';

export function executeCommand(career: Career, command: GameCommand, commandId: string): Career {
  if (!commandId || commandId.length > 160) throw new Error('잘못된 진행 요청입니다.');
  if (career.processedCommands.includes(commandId)) return career;
  let next: Career;
  switch (command.type) {
    case 'advance':
      if (!Number.isInteger(command.weeks) || command.weeks < 1 || command.weeks > 120) throw new Error('진행 범위는 1~120주입니다.');
      next = advanceCareer(career, command.weeks); break;
    case 'advanceHalf':
    case 'continueHalf': next = advanceHalf(career); break;
    case 'dismissChoice': next = dismissChoice(career); break;
    case 'training': next = setTraining(career, command.keys, command.intensity); break;
    case 'transfer': next = acceptTransfer(career, command.offerId); break;
    case 'captainDecision':next=respondToCaptainOffer(career,command.offerId,command.accept);break;
    case 'manualAging':next=manuallyAge(career,command.amount,command.key);break;
    case 'attributeLock':next=setAttributeLock(career,command.key,command.locked);break;
    case 'manualInjury':next=manuallyInjure(career,command.duration);break;
    case 'cheatSettings':next=configureCheats(career,command.enabled,command.freezeAging);break;
    case 'increaseAttribute':next=cheatIncreaseAttribute(career,command.key,command.amount);break;
    case 'stay': next = stayAtClub(career); break;
    case 'nextSeason': next = startNextSeason(career); break;
    case 'retire': next = retireCareer(career); break;
    default: throw new Error('지원하지 않는 진행 요청입니다.');
  }
  return { ...next, processedCommands: [...next.processedCommands, commandId] };
}
