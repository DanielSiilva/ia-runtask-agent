export interface RAGSource {
  // Define the structure of your RAG source here
  // For example:
  id: string;
  title: string;
  content: string;
}

export interface CustomerSupportCategory {
  id: string;
  name: string;
  description: string;
}

export interface RetrieveContextResult {
  context: string;
  isRagWorking: boolean;
  ragSources?: RAGSource[];
}
