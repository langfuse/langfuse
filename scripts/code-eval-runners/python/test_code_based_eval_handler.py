import unittest

from code_based_eval_handler import handler


def _event(source: str) -> dict:
    return {"code": {"source": source}, "payload": {}}


class CyclicEvaluatorResultTests(unittest.TestCase):
    def test_self_referential_list_returns_invalid_result(self):
        result = handler(
            _event(
                """
def evaluate(ctx):
    items = []
    items.append(items)
    return {"scores": [{"name": "x", "value": 1, "metadata": {"items": items}}]}
"""
            ),
            None,
        )

        self.assertEqual(result["error"]["code"], "INVALID_RESULT")
        self.assertIn("RecursionError", result["error"]["message"])

    def test_self_referential_dict_returns_invalid_result(self):
        result = handler(
            _event(
                """
def evaluate(ctx):
    payload = {}
    payload["self"] = payload
    return {"scores": [{"name": "x", "value": 1, "metadata": payload}]}
"""
            ),
            None,
        )

        self.assertEqual(result["error"]["code"], "INVALID_RESULT")
        self.assertIn("RecursionError", result["error"]["message"])

    def test_tuple_holding_cyclic_list_returns_invalid_result(self):
        # Tuples skip the recursive walk and reach json.dumps, which raises
        # ValueError instead of RecursionError.
        result = handler(
            _event(
                """
def evaluate(ctx):
    items = []
    items.append(items)
    return {"scores": [{"name": "x", "value": 1, "metadata": {"items": (items,)}}]}
"""
            ),
            None,
        )

        self.assertEqual(result["error"]["code"], "INVALID_RESULT")
        self.assertIn("Circular reference detected", result["error"]["message"])

    def test_recursion_inside_user_code_stays_user_code_error(self):
        result = handler(
            _event(
                """
def evaluate(ctx):
    def recurse():
        return recurse()
    return recurse()
"""
            ),
            None,
        )

        self.assertEqual(result["error"]["code"], "USER_CODE_ERROR")

    def test_acyclic_result_is_returned(self):
        result = handler(
            _event(
                """
def evaluate(ctx):
    return {"scores": [{"name": "x", "value": 1, "metadata": {"items": [1, 2]}}]}
"""
            ),
            None,
        )

        self.assertEqual(
            result,
            {
                "scores": [
                    {"name": "x", "value": 1, "metadata": {"items": [1, 2]}}
                ]
            },
        )


if __name__ == "__main__":
    unittest.main()
