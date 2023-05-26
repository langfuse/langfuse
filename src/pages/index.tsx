import LineChartLlmCalls from "../components/charts/lineChartllmCalls";
import Header from "../components/layouts/header";
import {
  Card,
  CardHeader,
  CardContent,
  CardDescription,
  CardFooter,
  CardTitle,
} from "../components/ui/card";

export default function Start() {
  return (
    <>
      <Header title="Dashboard" />
      <div>
        <Card>
          <CardHeader>
            <CardTitle>LLM calls</CardTitle>
            <CardDescription>Number, sum tokens</CardDescription>
          </CardHeader>
          <CardContent>
            <LineChartLlmCalls />
          </CardContent>
          <CardFooter>Todo: add link</CardFooter>
        </Card>
      </div>
    </>
  );
}
