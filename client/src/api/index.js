import axios from 'axios';
import { API_BASE_URL, COMMITS_PAGE_SIZE } from '../constants';

export function fetchDrives() {
  return axios.get(`${API_BASE_URL}/api/drives`).then(res => res.data);
}

export function fetchDirectories(dirPath) {
  return axios.post(`${API_BASE_URL}/api/list-directory`, { dirPath }).then(res => res.data);
}

export function checkGit(dirPath) {
  return axios.post(`${API_BASE_URL}/api/check-git`, { dirPath }).then(res => res.data);
}

export function fetchCommits(dirPath, branch, page = 1, pageSize = COMMITS_PAGE_SIZE) {
  return axios.post(`${API_BASE_URL}/api/commits`, { dirPath, branch, page, pageSize }).then(res => res.data);
}

export function checkoutBranch(dirPath, branch) {
  return axios.post(`${API_BASE_URL}/api/checkout`, { dirPath, branch }).then(res => res.data);
}

export function createBranch(dirPath, branchName, sourceBranch) {
  return axios.post(`${API_BASE_URL}/api/create-branch`, { dirPath, branchName, sourceBranch }).then(res => res.data);
}

export function mergeBranch(dirPath, sourceBranch) {
  return axios.post(`${API_BASE_URL}/api/merge-branch`, { dirPath, sourceBranch }).then(res => res.data);
}

export function renameBranch(dirPath, oldName, newName) {
  return axios.post(`${API_BASE_URL}/api/rename-branch`, { dirPath, oldName, newName }).then(res => res.data);
}

export function deleteBranch(dirPath, branch) {
  return axios.post(`${API_BASE_URL}/api/delete-branch`, { dirPath, branch }).then(res => res.data);
}

export function pushBranch(dirPath, branch) {
  return axios.post(`${API_BASE_URL}/api/push`, { dirPath, branch }).then(res => res.data);
}

export function fetchAll(dirPath) {
  return axios.post(`${API_BASE_URL}/api/fetch`, { dirPath }).then(res => res.data);
}

export function compareBranches(dirPath, baseBranch, compareBranch) {
  return axios.post(`${API_BASE_URL}/api/compare-branches`, { dirPath, baseBranch, compareBranch }).then(res => res.data);
}

export function getCommitDiff(dirPath, commitHash) {
  return axios.post(`${API_BASE_URL}/api/commit-diff`, { dirPath, commitHash }).then(res => res.data);
}

export function fetchCommitFiles(dirPath, commitHash) {
  return axios.post(`${API_BASE_URL}/api/commit-files`, { dirPath, commitHash }).then(res => res.data);
}

export function fetchCommitFileDiff(dirPath, commitHash, filePath) {
  return axios.post(`${API_BASE_URL}/api/commit-file-diff`, { dirPath, commitHash, filePath }).then(res => res.data);
}

export function rebaseBranch(dirPath, targetBranch) {
  return axios.post(`${API_BASE_URL}/api/rebase-branch`, { dirPath, targetBranch }).then(res => res.data);
}

export function saveLastPath(dirPath) {
  return axios.post(`${API_BASE_URL}/api/save-last-path`, { dirPath });
}

export function getLastPath() {
  return axios.get(`${API_BASE_URL}/api/last-path`).then(res => res.data.lastPath);
}

export function fetchLocalStatus(dirPath) {
  return axios.post(`${API_BASE_URL}/api/local-status`, { dirPath }).then(res => res.data);
}

export function fetchLocalFileDiff(dirPath, filePath, type) {
  return axios.post(`${API_BASE_URL}/api/local-file-diff`, { dirPath, filePath, type }).then(res => res.data);
}

export function commitChanges(dirPath, message, selectedFiles) {
  return axios.post(`${API_BASE_URL}/api/local-commit`, { dirPath, message, selectedFiles }).then(res => res.data);
}

export function commitAndPush(dirPath, message, selectedFiles) {
  return axios.post(`${API_BASE_URL}/api/local-commit-push`, { dirPath, message, selectedFiles }).then(res => res.data);
}
