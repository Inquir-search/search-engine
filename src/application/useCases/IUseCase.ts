export interface IUseCase<TIn, TOut> {
    execute(command: TIn, indexName: string): Promise<TOut>;
}