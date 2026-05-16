import { homedir } from 'node:os';
import path from 'node:path';

export type Paths = {
  home: string;
  root: string;
  db: string;
  socket: string;
  events: string;
  logs: string;
  bin: string;
  installState: string;
  claudeProjects: string;
  claudeSessions: string;
  claudePluginRoot: string;
  launchAgents: string;
  configFile: string;
};

export function resolvePaths(home: string = homedir()): Paths {
  const root = path.join(home, '.repo-orch');
  return {
    home,
    root,
    db: path.join(root, 'state.db'),
    socket: path.join(root, 'daemon.sock'),
    events: path.join(root, 'events'),
    logs: path.join(root, 'logs'),
    bin: path.join(root, 'bin'),
    installState: path.join(root, 'install-state.json'),
    claudeProjects: path.join(home, '.claude', 'projects'),
    claudeSessions: path.join(home, '.claude', 'sessions'),
    claudePluginRoot: path.join(home, '.claude', 'plugins', 'repo-orch'),
    launchAgents: path.join(home, 'Library', 'LaunchAgents'),
    configFile: path.join(root, 'config.json'),
  };
}
