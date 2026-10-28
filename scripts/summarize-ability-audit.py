"""Summarize paired ability experiments; do not infer missing historical match actions."""
import json
from pathlib import Path
root=Path('test-results/release-2.10.1')
before=json.loads((root/'before.json').read_text())
after=json.loads((root/'after.json').read_text())
field={'strength':'tackles','stamina':'lateSuccesses','speed':'dribbleAttempts','agility':'dribblesCompleted','jumping':'aerialWon','ballControl':'passesCompleted','dribbling':'dribblesCompleted','passing':'passesCompleted','crossing':'keyPasses','shooting':'shotsOnTarget','heading':'aerialWon','defending':'tackles','setPieces':'shotsOnTarget','decisions':'passesCompleted','vision':'keyPasses','anticipation':'interceptions','positioning':'shots','composure':'shotsOnTarget','concentration':'passesCompleted','teamwork':'passes'}
keeper={'gkShotStopping':'saves','gkReflexes':'saves','gkHandling':'handlingSuccesses','gkOneOnOnes':'oneOnOneSaves','gkPositioning':'sweepingSuccesses','gkDistribution':'buildUpCompleted','decisions':'sweepingSuccesses','concentration':'handlingSuccesses','gkDefensiveOrganization':'shotsFaced'}
checks=[]
for context,links in after['links'].items():
    for key,pair in links.items():
        metrics=['crossesCaught','punches'] if key=='gkAerialCommand' else [(field if context=='CM' else keeper)[key]]
        sign=-1 if key=='gkDefensiveOrganization' else 1
        values={}
        for label,data in [('before',before),('after',after)]:
            row=data['links'][context][key]
            values[label]={side:sum(row[side]['stats'][metric] for metric in metrics) for side in ['low','high']}
        passed=(values['after']['high']-values['after']['low'])*sign>0
        checks.append({'context':context,'attribute':key,'metric':'+'.join(metrics),'direction':sign,**values,'passed':passed})
assert len(checks)==30 and all(row['passed'] for row in checks),[row for row in checks if not row['passed']]
tiers={position:[{'ovr':b['ovr'],'before':{'goals38':a['per38']['goals'],'assists38':a['per38']['assists'],'teamGF38':a['teamGF'],'teamGA38':a['teamGA'],'points38':a['points38']},'after':{'goals38':b['per38']['goals'],'assists38':b['per38']['assists'],'teamGF38':b['teamGF'],'teamGA38':b['teamGA'],'points38':b['points38']}} for a,b in zip(before['tiers'][position],rows)] for position,rows in after['tiers'].items()}
npc={label:sum(row['goalsPerGame'] for row in data['npc'])/len(data['npc']) for label,data in [('before',before),('after',after)]}
assert abs(npc['before']-npc['after'])<.45,npc
selection={position:{label:{'starts':data['selection'][position]['automatic']['stats']['starts'],'apps':data['selection'][position]['automatic']['apps'],'minutes':data['selection'][position]['automatic']['minutes']} for label,data in [('before',before),('after',after)]} for position in after['selection']}
report={'baseline':'2.10.0','version':'2.10.1','matchesPerPair':after['matchesPerPair'],'checks':checks,'all30Passed':True,'tiers':tiers,'selection':selection,'NPCPremierLeagueGoalsPerGame':npc,'conditions':'Fixed opponent Manchester City, actual calibrated squads, forced 90 minutes for tier/attribute probes, identical seeds; per38 is a projection, not an actual season. Positional selection is a separate automatic sample.'}
(root/'ability-audit-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'all30Passed':True,'NPC':npc,'selection':selection},ensure_ascii=False))
