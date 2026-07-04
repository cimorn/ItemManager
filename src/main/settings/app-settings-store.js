const fs = require('node:fs/promises');
const path = require('node:path');

async function ensureSettingsFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(
      filePath,
      `${JSON.stringify({ recentProjects: [], lastOpenedProject: null }, null, 2)}\n`,
      'utf8'
    );
  }
}

async function createAppSettingsStore({ filePath }) {
  const memoryState = {
    recentProjects: [],
    lastOpenedProject: null
  };

  async function readState() {
    if (filePath === 'memory') {
      return memoryState;
    }

    await ensureSettingsFile(filePath);
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  }

  async function writeState(nextState) {
    if (filePath === 'memory') {
      memoryState.recentProjects = nextState.recentProjects;
      memoryState.lastOpenedProject = nextState.lastOpenedProject;
      return;
    }

    await ensureSettingsFile(filePath);
    await fs.writeFile(filePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  }

  return {
    async getRecentProjects() {
      const state = await readState();
      return state.recentProjects;
    },
    async recordRecentProject(entry) {
      const state = await readState();
      const deduped = state.recentProjects.filter((item) => item.path !== entry.path);
      const nextState = {
        ...state,
        recentProjects: [entry, ...deduped].slice(0, 10)
      };

      await writeState(nextState);
      return nextState.recentProjects;
    },
    async removeRecentProject(projectPath) {
      const state = await readState();
      const nextState = {
        ...state,
        recentProjects: state.recentProjects.filter((item) => item.path !== projectPath),
        lastOpenedProject: state.lastOpenedProject === projectPath ? null : state.lastOpenedProject
      };

      await writeState(nextState);
      return nextState.recentProjects;
    },
    async setLastOpenedProject(projectPath) {
      const state = await readState();
      const nextState = {
        ...state,
        lastOpenedProject: projectPath
      };

      await writeState(nextState);
      return projectPath;
    },
    async getLastOpenedProject() {
      const state = await readState();
      return state.lastOpenedProject;
    }
  };
}

module.exports = { createAppSettingsStore };
