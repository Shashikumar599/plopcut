# Builds the 30 s soundtrack: SFX cues + music bed, mastered to about -14 LUFS -> work/mix.wav
import subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.join(HERE, '../source/sfx')
MUSIC = os.path.join(HERE, '../../editor/content/music/upbeat/Monkeys Spinning Monkeys.mp3')

# (file, at seconds, gain dB, keep seconds or None, fade-out seconds)
CUES = [
    ('bass_hit_1', 0.00, -3, 0.75, 0.25),   # Software is dead
    ('bass_hit_3', 0.80, -5, 0.50, 0.15),   # Adobe Photoshop
    ('bass_hit_1', 1.30, -5, 0.80, 0.25),   # Everything is free
    ('riser_1',    1.30, -7, 2.80, 0.05),   # rise to the REA reveal
    ('bass_hit_3', 3.10, -3, 1.00, 0.30),   # All thanks to REA
    ('record_scratch_1', 4.10, 5, 0.90, 0.20),  # ...wait
    ('low_thud_2', 5.30, -9, None, 0.10),   # browser appears
    ('low_thud_1', 6.05, 0, None, 0.05),    # 451 stamp
    ('whoosh_1',  11.80, -1, None, 0.10),   # Flash ramp: the yak leaves the ground
    ('low_thud_1', 12.00, -8, None, 0.05),
    ('low_thud_2', 27.60, -2, None, 0.20),  # The backend never will be.
    ('plop_1',    28.80, 13, None, 0.10),   # plopcut pops
    ('low_thud_1', 29.42, -7, None, 0.05),  # p tips over: soft thud
]
args, chains, labels = ['ffmpeg', '-v', 'error', '-y'], [], []
for i, (f, at, g, keep, fo) in enumerate(CUES):
    args += ['-i', os.path.join(SFX, f + '.mp3')]
    trim = f'atrim=0:{keep},' if keep else ''
    fade = f'afade=t=out:st={max(0, keep - fo)}:d={fo},' if keep else ''
    ms = int(at * 1000)
    chains.append(f'[{i}:a]aresample=48000,aformat=channel_layouts=stereo,{trim}{fade}volume={g}dB,adelay={ms}|{ms}[s{i}]')
    labels.append(f'[s{i}]')
m = len(CUES)
args += ['-i', MUSIC]
# music: in at 6.8 s, ducked from 20.3 s, fades out 24.3-26.5 s
chains.append(f"[{m}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:19.7,"
              f"volume='if(lt(t,13.5),1,0.32)':eval=frame,afade=t=in:st=0:d=0.05,afade=t=out:st=17.5:d=2.2,"
              f"volume=0dB,adelay=6800|6800[mus]")
labels.append('[mus]')
chains.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0,atrim=0:30,apad=whole_dur=30,'
              'loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[out]')
args += ['-filter_complex', ';'.join(chains), '-map', '[out]', '-ac', '2', os.path.join(HERE, 'mix.wav')]
subprocess.run(args, check=True)
print('wrote mix.wav')
