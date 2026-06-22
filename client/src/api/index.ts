import axios from 'axios';
import { API_BASE_URL, COMMITS_PAGE_SIZE } from '../constants';

export function fetchDrives() {
  return axios.get(`${API_BASE_URL}/api/drives`).then(res => res.data);
}

export function fetchDirectories(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/list-directory`, { dirPath }).then(res => res.data);
}

export function checkGit(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/check-git`, { dirPath }).then(res => res.data);
}

export function fetchCommits(dirPath: string, branch: string, page = 1, pageSize = COMMITS_PAGE_SIZE) {
  return axios.post(`${API_BASE_URL}/api/commits`, { dirPath, branch, page, pageSize }).then(res => res.data);
}

export interface CommitGraphResponse {
  rows: { graph: string; commit: { hash: string; parents: string; message: string; author: string; date: string; refs: string } | null }[];
  total: number;
  page: number;
  pageSize: number;
  headHash: string;
}

export function fetchCommitGraph(dirPath: string, page = 1, pageSize = COMMITS_PAGE_SIZE, branch?: string) {
  return axios.post(`${API_BASE_URL}/api/commit-graph`, { dirPath, page, pageSize, branch }).then(res => res.data);
}

export function checkoutBranch(dirPath: string, branch: string) {
  return axios.post(`${API_BASE_URL}/api/checkout`, { dirPath, branch }).then(res => res.data);
}

export function createBranch(dirPath: string, branchName: string, sourceBranch?: string) {
  return axios.post(`${API_BASE_URL}/api/create-branch`, { dirPath, branchName, sourceBranch }).then(res => res.data);
}

export function mergeBranch(dirPath: string, sourceBranch: string) {
  return axios.post(`${API_BASE_URL}/api/merge-branch`, { dirPath, sourceBranch }).then(res => res.data);
}

export function renameBranch(dirPath: string, oldName: string, newName: string) {
  return axios.post(`${API_BASE_URL}/api/rename-branch`, { dirPath, oldName, newName }).then(res => res.data);
}

export function deleteBranch(dirPath: string, branch: string) {
  return axios.post(`${API_BASE_URL}/api/delete-branch`, { dirPath, branch }).then(res => res.data);
}

export function fetchPendingCommits(dirPath: string, branch: string) {
  return axios.post(`${API_BASE_URL}/api/pending-commits`, { dirPath, branch }).then(res => res.data);
}

export function pushBranch(dirPath: string, branch: string) {
  return axios.post(`${API_BASE_URL}/api/push`, { dirPath, branch }).then(res => res.data);
}

export function fetchAll(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/fetch`, { dirPath }).then(res => res.data);
}

export function compareBranches(dirPath: string, baseBranch: string, compareBranch: string) {
  return axios.post(`${API_BASE_URL}/api/compare-branches`, { dirPath, baseBranch, compareBranch }).then(res => res.data);
}

export function getCommitDiff(dirPath: string, commitHash: string) {
  return axios.post(`${API_BASE_URL}/api/commit-diff`, { dirPath, commitHash }).then(res => res.data);
}

export function fetchCommitFiles(dirPath: string, commitHash: string) {
  return axios.post(`${API_BASE_URL}/api/commit-files`, { dirPath, commitHash }).then(res => res.data);
}

export function fetchCommitFileDiff(dirPath: string, commitHash: string, filePath: string) {
  return axios.post(`${API_BASE_URL}/api/commit-file-diff`, { dirPath, commitHash, filePath }).then(res => res.data);
}

export function cherryPickCommit(dirPath: string, commitHash: string) {
  return axios.post(`${API_BASE_URL}/api/cherry-pick`, { dirPath, commitHash }).then(res => res.data);
}

export function revertCommit(dirPath: string, commitHash: string) {
  return axios.post(`${API_BASE_URL}/api/revert-commit`, { dirPath, commitHash }).then(res => res.data);
}

export function dropCommit(dirPath: string, commitHash: string, parentHash: string, branch: string) {
  return axios.post(`${API_BASE_URL}/api/drop-commit`, { dirPath, commitHash, parentHash, branch }).then(res => res.data);
}

export function rebaseBranch(dirPath: string, targetBranch: string) {
  return axios.post(`${API_BASE_URL}/api/rebase-branch`, { dirPath, targetBranch }).then(res => res.data);
}

export function fetchConflictFiles(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/conflict-files`, { dirPath }).then(res => res.data);
}

export function fetchConflictFileContent(dirPath: string, filePath: string) {
  return axios.post(`${API_BASE_URL}/api/conflict-file-content`, { dirPath, filePath }).then(res => res.data);
}

export function abortMerge(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/abort-merge`, { dirPath }).then(res => res.data);
}

export function resolveConflictFile(dirPath: string, filePath: string, content: string) {
  return axios.post(`${API_BASE_URL}/api/resolve-conflict-file`, { dirPath, filePath, content }).then(res => res.data);
}

export function continueMerge(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/continue-merge`, { dirPath }).then(res => res.data);
}

export function saveLastPath(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/save-last-path`, { dirPath });
}

export function getLastPath() {
  return axios.get(`${API_BASE_URL}/api/last-path`).then(res => res.data.lastPath);
}

export function fetchLocalStatus(dirPath: string) {
  return axios.post(`${API_BASE_URL}/api/local-status`, { dirPath }).then(res => res.data);
}

export function fetchLocalFileDiff(dirPath: string, filePath: string, type: string) {
  return axios.post(`${API_BASE_URL}/api/local-file-diff`, { dirPath, filePath, type }).then(res => res.data);
}

export function restoreFile(dirPath: string, selectedFiles: string[]) {
  return axios.post(`${API_BASE_URL}/api/local-restore-file`, { dirPath, selectedFiles }).then(res => res.data);
}

export function stageFiles(dirPath: string, selectedFiles: string[]) {
  return axios.post(`${API_BASE_URL}/api/local-stage-files`, { dirPath, selectedFiles }).then(res => res.data);
}

export function unstageFiles(dirPath: string, selectedFiles: string[]) {
  return axios.post(`${API_BASE_URL}/api/local-unstage-files`, { dirPath, selectedFiles }).then(res => res.data);
}

export function commitChanges(dirPath: string, message: string, selectedFiles: string[]) {
  return axios.post(`${API_BASE_URL}/api/local-commit`, { dirPath, message, selectedFiles }).then(res => res.data);
}

export function commitAndPush(dirPath: string, message: string, selectedFiles: string[]) {
  return axios.post(`${API_BASE_URL}/api/local-commit-push`, { dirPath, message, selectedFiles }).then(res => res.data);
}

export function fetchUiState() {
  return axios.get(`${API_BASE_URL}/api/ui-state`).then(res => res.data);
}

export function saveUiState(state: Record<string, any>) {
  return axios.post(`${API_BASE_URL}/api/ui-state`, state).then(res => res.data);
}
